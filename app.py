import json
import torch
from flask import Flask, render_template, request, jsonify
from transformers import AutoTokenizer, AutoModelForCausalLM

app = Flask(__name__, 
            static_folder='app/static',
            template_folder='app/templates')

MODEL_NAME = "openai-community/gpt2"

class AttentionExtractor:
    def __init__(self, model):
        self.model = model
        self.attention_weights = []
        
    def extract_attention(self, input_ids, tokenizer):
        """Extract attention patterns and token information"""
        # Clear any previous data
        self.attention_weights = []
        
        # Define hook function
        def attention_hook(module, input, output):
            # Extract attention weights from output
            # For GPT2: output is a tuple where the last element contains attention weights
            # Shape: [batch_size, num_heads, seq_len, seq_len]
            if isinstance(output, tuple) and len(output) >= 3:
                weights = output[2]  # For GPT-2, attention weights are in index 2
                self.attention_weights.append(weights.detach().cpu().numpy())
        
        # Register hooks on each transformer layer's attention module
        hooks = []
        for i, layer in enumerate(self.model.transformer.h):
            hooks.append(layer.attn.register_forward_hook(attention_hook))
        
        # Run model inference
        with torch.no_grad():
            outputs = self.model(input_ids, output_attentions=True)
        
        # Remove hooks
        for hook in hooks:
            hook.remove()
        
        # Get token texts
        token_texts = tokenizer.convert_ids_to_tokens(input_ids[0].tolist())
        
        # Format data for visualization
        formatted_data = {
            "tokens": [{"text": t, "index": i} for i, t in enumerate(token_texts)],
            "layers": []
        }
        
        # Process each layer's attention weights
        for layer_idx, layer_weights in enumerate(self.attention_weights):
            # Handle batch dimension (just take first item in batch)
            layer_weights = layer_weights[0]
            
            layer_data = {
                "index": layer_idx,
                "heads": []
            }
            
            # Process each attention head
            for head_idx in range(layer_weights.shape[0]):
                head_weights = layer_weights[head_idx]
                
                # Convert to list of [source, target, weight] entries
                # Only include weights above threshold
                sparse_weights = []
                for i in range(head_weights.shape[0]):
                    for j in range(head_weights.shape[1]):
                        if head_weights[i, j] > 0.01:  # Minimum threshold for storage
                            sparse_weights.append([i, j, float(head_weights[i, j])])
                
                layer_data["heads"].append({
                    "index": head_idx,
                    "weights": sparse_weights
                })
            
            formatted_data["layers"].append(layer_data)
        
        return formatted_data

# Initialize global variables
tokenizer = None
model = None
extractor = None

def load_model():
    global tokenizer, model, extractor
    
    if tokenizer is None:
        print("Loading model and tokenizer...")
        try:
            # GPT-2 is a public model, no authentication needed
            tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
            model = AutoModelForCausalLM.from_pretrained(MODEL_NAME, output_attentions=True, attn_implementation="eager")
                
            extractor = AttentionExtractor(model)
            print("Model and tokenizer loaded!")
        except Exception as e:
            print(f"Error loading model: {str(e)}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/attention', methods=['POST'])
def analyze_attention():
    data = request.json
    input_text = data.get('text', '')
    generate_tokens = data.get('generate', 0)  # Default: don't generate
    
    if not input_text:
        return jsonify({"error": "No text provided"}), 400
    
    try:
        # Load model if not already loaded
        load_model()
        
        # Tokenize input
        inputs = tokenizer(input_text, return_tensors="pt")
        
        # Check if sequence is too long
        if inputs.input_ids.shape[1] > 100:
            return jsonify({"error": "Text too long. Please limit to 100 tokens."}), 400
            
        if generate_tokens > 20:  # Limit max generation
            generate_tokens = 20
        
        if generate_tokens > 0:
            # Extract attention patterns for autoregressive generation
            attention_data = generate_with_attention(inputs.input_ids, generate_tokens)
        else:
            # Extract attention patterns for input text only
            attention_data = extractor.extract_attention(inputs.input_ids, tokenizer)
        
        return jsonify(attention_data)
    
    except Exception as e:
        print("Error:", str(e))
        return jsonify({"error": str(e)}), 500

def generate_with_attention(input_ids, num_tokens=5):
    """Generate text autoregressively and extract attention patterns for each step"""
    global tokenizer, model, extractor
    
    # Initial context
    context = input_ids.clone()
    
    # Store data for each generation step
    generation_data = {
        "tokens": [],
        "generation_steps": [],
        "layers": []
    }
    
    # Initial token texts
    input_token_texts = tokenizer.convert_ids_to_tokens(context[0].tolist())
    for i, text in enumerate(input_token_texts):
        generation_data["tokens"].append({
            "text": text, 
            "index": i,
            "step": 0  # Original input tokens
        })
    
    # Extract attention patterns for the input
    input_attention = extractor.extract_attention(context, tokenizer)
    
    # Add input attention patterns with step info
    for layer_data in input_attention["layers"]:
        layer_data["generation_step"] = 0
        generation_data["layers"].append(layer_data)
    
    # Record the step boundaries
    generation_data["generation_steps"].append({
        "step": 0,
        "token_index": len(input_token_texts) - 1,
        "layer_index": len(input_attention["layers"]) - 1
    })
    
    # Generate tokens one by one
    for step in range(1, num_tokens + 1):
        # Generate next token
        with torch.no_grad():
            outputs = model.generate(
                context,
                max_new_tokens=1,
                return_dict_in_generate=True,
                output_scores=True,
                output_attentions=True
            )
        
        # Update context with new token
        next_token = outputs.sequences[0, -1].unsqueeze(0).unsqueeze(0)
        context = torch.cat([context, next_token], dim=1)
        
        # Get the text of the new token
        new_token_text = tokenizer.convert_ids_to_tokens(next_token[0].item())
        generation_data["tokens"].append({
            "text": new_token_text,
            "index": len(generation_data["tokens"]),
            "step": step  # Generation step
        })
        
        # Extract attention patterns for this step
        step_attention = extractor.extract_attention(context, tokenizer)
        
        # Add this step's attention patterns with step info
        for layer_data in step_attention["layers"]:
            layer_data["generation_step"] = step
            generation_data["layers"].append(layer_data)
        
        # Record the step boundaries
        last_layer_index = len(generation_data["layers"]) - 1
        generation_data["generation_steps"].append({
            "step": step,
            "token_index": len(generation_data["tokens"]) - 1,
            "layer_index": last_layer_index
        })
    
    return generation_data

if __name__ == '__main__':
    app.run(debug=True)