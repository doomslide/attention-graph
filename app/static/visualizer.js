class StaticGridVisualization {
    constructor(containerId, config = {}) {
        this.container = d3.select(`#${containerId}`);
        
        // Calculate optimal dimensions based on container
        const containerWidth = this.container.node().clientWidth;
        const containerHeight = this.container.node().clientHeight;
        
        // Use significantly reduced vertical spacing between layers
        const verticalSpacingMultiplier = 1.0; // Reduced from 1.4 to 1.0 for tighter spacing
        const baseLayerSpacing = Math.floor(containerHeight / 14); // 12 layers + token row + padding
        const optimalLayerSpacing = Math.floor(baseLayerSpacing * verticalSpacingMultiplier);
        const optimalTokenRadius = Math.max(3, Math.floor(optimalLayerSpacing / 10));
        
        this.config = {
            width: containerWidth,
            height: containerHeight,
            tokenSpacing: config.tokenSpacing || 55, // Increased horizontal spacing from 40 to 55
            layerSpacing: optimalLayerSpacing, // Slightly reduced vertical spacing
            tokenRadius: optimalTokenRadius,
            minEdgeOpacity: config.minEdgeOpacity || 0.15,
            maxEdgeOpacity: config.maxEdgeOpacity || 0.95,
            colors: this._generateColorPalette(12), // For attention heads
            threshold: config.threshold || 0.98,
            showArrowheads: false, // Disabled arrowheads as arrows are implicit in bottom-to-top layout
            modelDepth: 12, // Default to 12 layers
            strandCurvature: 0.6, // Increased curvature for better separation (0-1)
            strandWidth: 0.25, // Even thinner strands (reduced by 50%)
            ...config
        };
        
        // For aesthetic reasons, make sure certain proportions look good
        this.config.layerSpacing = Math.max(this.config.layerSpacing, 60); // Increased minimum spacing
        
        this.data = null;
        this.visibleHeads = new Set(Array.from({length: 12}, (_, i) => i)); // All heads visible by default
        this.focusedToken = null; // For persistent token focus
        
        this._initializeSVG();
    }
    
    _generateColorPalette(n) {
        // Generate optimized palette for n distinct colors using a more vibrant scheme
        // Avoid pure blue and reds which can be hard to see on dark background
        const baseColors = [
            "#ff9500", "#00e5ff", "#ff00e5", "#73ff00", "#00a2ff",
            "#ffea00", "#ff2d00", "#00ff8d", "#cc00ff", "#ffe100",
            "#30a2ff", "#ff5599", "#84ff39", "#00ffea", "#ff8d00"
        ];
        
        if (n <= baseColors.length) {
            return baseColors.slice(0, n);
        }
        
        return d3.range(n).map(i => d3.interpolateRainbow(i / n));
    }
    
    _initializeSVG() {
        // Clear any existing content
        this.container.html("");
        
        // Create a container div for the visualization
        this.vizContainer = this.container.append("div")
            .attr("class", "visualization-scroll-container")
            .style("width", "100%")
            .style("height", "100%")
            .style("position", "relative");
        
        // Create SVG element with a dark background
        this.svg = this.vizContainer.append("svg")
            .attr("class", "grid-visualization-svg")
            .style("background-color", "#111");
        
        // Create layers for rendering different parts of the grid visualization
        this.gridLayer = this.svg.append("g").attr("class", "grid-layer");
        this.edgeLayer = this.svg.append("g").attr("class", "edge-layer");
        this.nodeLayer = this.svg.append("g").attr("class", "node-layer");
        this.tokenLayer = this.svg.append("g").attr("class", "token-layer");
        this.labelLayer = this.svg.append("g").attr("class", "label-layer");
    }
    
    // Render the full grid visualization
    renderVisualization() {
        if (!this.data || !this.data.layers || this.data.layers.length === 0) {
            console.error("No visualization data available");
            return;
        }
        
        // Show the visualization tools after data is loaded
        document.querySelector('.visualization-tools').classList.remove('hidden');
        
        const tokens = this.data.tokens;
        const tokensCount = tokens.length;
        const layersCount = this.config.modelDepth;
        
        // Calculate grid dimensions with increased spacing
        const tokenSpacing = Math.max(40, this.config.tokenSpacing); // Increased minimum from 30 to 40
        const layerSpacing = this.config.layerSpacing;
        
        // Calculate total width needed for all tokens with extra padding
        const totalWidth = Math.max(800, (tokensCount + 1) * tokenSpacing);
        
        // Add top and bottom padding for better visual balance
        const topPadding = 80; // Padding at the top of the grid
        const bottomPadding = 45; // Increased slightly to accommodate taller token boxes
        
        // Fixed height to fit all layers with padding
        const totalHeight = topPadding + (layersCount * layerSpacing) + bottomPadding;
        
        // Update SVG size
        this.svg
            .attr("width", totalWidth)
            .attr("height", totalHeight)
            .attr("viewBox", [0, 0, totalWidth, totalHeight]);
        
        // Clear previous elements
        this.gridLayer.selectAll("*").remove();
        this.nodeLayer.selectAll("*").remove();
        this.edgeLayer.selectAll("*").remove();
        this.tokenLayer.selectAll("*").remove();
        this.labelLayer.selectAll("*").remove();
        
        // Draw background
        this.gridLayer.append("rect")
            .attr("width", totalWidth)
            .attr("height", totalHeight)
            .attr("fill", "#111");
            
        // Add a subtle grid pattern
        const gridSize = 20;
        for (let x = 0; x < totalWidth; x += gridSize) {
            this.gridLayer.append("line")
                .attr("x1", x)
                .attr("y1", 0)
                .attr("x2", x)
                .attr("y2", totalHeight)
                .attr("stroke", "#222")
                .attr("stroke-width", 0.5);
        }
        
        for (let y = 0; y < totalHeight; y += gridSize) {
            this.gridLayer.append("line")
                .attr("x1", 0)
                .attr("y1", y)
                .attr("x2", totalWidth)
                .attr("y2", y)
                .attr("stroke", "#222")
                .attr("stroke-width", 0.5);
        }
        
        // Draw horizontal grid lines for each layer
        for (let i = 0; i < layersCount; i++) {
            const yPos = topPadding + (i * layerSpacing); // Apply top padding to position
            
            this.gridLayer.append("line")
                .attr("class", "grid-line")
                .attr("x1", 0)
                .attr("y1", yPos)
                .attr("x2", totalWidth)
                .attr("y2", yPos)
                .attr("stroke", "#333")
                .attr("stroke-width", 1);
                
            // Add layer label directly on the grid line
            // Use numeric layer label to ensure visibility
            const layerNum = layersCount - i;
            const layerText = `Layer ${layerNum}`;
            const textWidth = 85; // Increased for better padding around text
            
            // Create a group for the layer label to handle transforms
            const labelGroup = this.labelLayer.append("g")
                .attr("class", "layer-label-group")
                .attr("transform", `translate(0, ${yPos})`); // Position at grid line
            
            // Add a background rectangle that connects to the grid
            labelGroup.append("rect")
                .attr("class", "layer-label-bg")
                .attr("x", -textWidth) // Extend left from grid edge
                .attr("y", -12) // Adjusted position for taller box
                .attr("width", textWidth) // Fixed width
                .attr("height", 24) // Increased layer label height
                .attr("fill", "rgba(40,44,52,0.95)") // Dark background to match token labels
                .attr("rx", 3)
                .attr("ry", 3)
                .attr("stroke", "#555") // Subtle border
                .attr("stroke-width", 1);
            
            // Add a rectangle that overlaps with the grid line for visual connection
            labelGroup.append("rect")
                .attr("x", -3) // Overlap with grid slightly
                .attr("y", -12) // Match main label box
                .attr("width", 8) // Extend into grid
                .attr("height", 24) // Match main label box
                .attr("fill", "rgba(40,44,52,0.95)") // Match dark background
                .attr("rx", 0)
                .attr("ry", 0);
            
            // Add accent line at the top of the label box
            labelGroup.append("rect")
                .attr("class", "layer-label-accent")
                .attr("x", -textWidth) // Match background width
                .attr("y", -12) // Adjusted to match main label box
                .attr("width", textWidth + 5) // Extend slightly into grid
                .attr("height", 3) // Thin accent line
                .attr("fill", "#5a9cd8") // Blue accent
                .attr("rx", 1)
                .attr("ry", 1);
            
            // Add the layer number text
            labelGroup.append("text")
                .attr("class", "layer-label-text")
                .attr("x", -10) // Positioned inside the box
                .attr("y", 4) // Centered vertically
                .attr("text-anchor", "end") // Right-aligned
                .attr("font-size", "11px") // Reduced to 80% of original 14px
                .attr("fill", "#ffffff") // White text on dark background
                .attr("font-weight", "500") // Less bold (medium weight)
                .attr("font-family", "'JetBrains Mono', 'Fira Code', Consolas, monospace") // Match token labels
                .attr("stroke", "#000000") // Thin black outline
                .attr("stroke-width", 0.3) // Very thin outline
                .text(layerText);
        }
        
        // Create grid nodes for each token at each layer
        const nodeData = [];
        for (let layerIdx = 0; layerIdx < layersCount; layerIdx++) {
            for (let tokenIdx = 0; tokenIdx < tokensCount; tokenIdx++) {
                nodeData.push({
                    layer: layerIdx,
                    token: tokenIdx,
                    x: tokenIdx * tokenSpacing + tokenSpacing/2, // Center in grid cell
                    y: topPadding + (layerIdx * layerSpacing), // Apply top padding to position
                    tokenText: tokens[tokenIdx].text,
                    id: `node-${layerIdx}-${tokenIdx}`
                });
            }
        }
        
        // Draw nodes with glowing effect
        this.nodeLayer.selectAll(".grid-node")
            .data(nodeData)
            .enter()
            .append("circle")
            .attr("class", d => `grid-node token-${d.token} layer-${d.layer}`)
            .attr("id", d => d.id)
            .attr("cx", d => d.x)
            .attr("cy", d => d.y)
            .attr("r", this.config.tokenRadius)
            .attr("fill", "#444")
            .attr("stroke", "#666")
            .attr("stroke-width", 1)
            .style("filter", "url(#glow)")
            .on("mouseover", (event, d) => this._highlightNode(d))
            .on("mouseout", () => this._unhighlightNode())
            .on("click", (event, d) => this._toggleNodeFocus(d));
            
        // Add a glow filter for nodes
        const defs = this.svg.append("defs");
        
        const filter = defs.append("filter")
            .attr("id", "glow")
            .attr("x", "-50%")
            .attr("y", "-50%")
            .attr("width", "200%")
            .attr("height", "200%");
            
        filter.append("feGaussianBlur")
            .attr("stdDeviation", "1.5")
            .attr("result", "coloredBlur");
            
        const feMerge = filter.append("feMerge");
        feMerge.append("feMergeNode")
            .attr("in", "coloredBlur");
        feMerge.append("feMergeNode")
            .attr("in", "SourceGraphic");
        
        // Process token texts first to use for sizing
        const processedTokens = tokens.map(token => {
            // Clean up token text by removing artifacts
            let cleanText = token.text;
            // Remove common token artifacts (Ġ, ĉ, etc.) often found in tokenized text
            cleanText = cleanText.replace(/Ġ|ĉ|Ċ|ċ|Ĉ|▁|<\/?[^>]+(>|$)/g, '');
            // Simplify spaces around punctuation for better visibility
            cleanText = cleanText.trim();
            return {
                original: token,
                cleanText: cleanText,
                length: cleanText.length
            };
        });
        
        // Draw token labels consistent with layer labels
        for (let i = 0; i < tokensCount; i++) {
            const tokenX = i * tokenSpacing + tokenSpacing/2;
            const tokenY = topPadding + (layersCount * layerSpacing) + 0; // DIRECTLY below the grid (no gap)
            const tokenText = processedTokens[i].cleanText;
            // Make sure boxes don't exceed token spacing to avoid overlap
            // Increase box size by using larger multipliers while keeping text size the same
            const textWidth = Math.min(tokenSpacing - 8, Math.max(50, tokenText.length * 7.5 + 12)); // Larger boxes
            
            // Create a group for the token label to handle transforms
            const tokenGroup = this.tokenLayer.append("g")
                .attr("class", "token-group")
                .attr("data-index", i);
            
            // Bright background with dark text - inverted color scheme
            tokenGroup.append("rect")
                .attr("class", "token-label-bg")
                .attr("x", tokenX - textWidth/2) // Centered on token node
                .attr("y", tokenY - 15) // Adjusted position for taller box
                .attr("width", textWidth) 
                .attr("height", 30) // Increased height by 25%
                .attr("fill", "#E0E0E0") // Light gray/white background
                .attr("rx", 3) // Slightly rounded corners
                .attr("ry", 3)
                .attr("stroke", "#555555") // Dark gray border
                .attr("stroke-width", 1); // Normal border
            
            // Add accent line at the top of the label box
            tokenGroup.append("rect")
                .attr("class", "token-label-accent")
                .attr("x", tokenX - textWidth/2)
                .attr("y", tokenY - 15) // Adjusted to match new background position
                .attr("width", textWidth)
                .attr("height", 3) // Thin accent line
                .attr("fill", "#5a9cd8") // Blue accent matching layers
                .attr("rx", 1)
                .attr("ry", 1);
            
            // Just use a single text layer with dark text on light background
            tokenGroup.append("text")
                .attr("class", "token-label-text")
                .attr("x", tokenX)
                .attr("y", tokenY)
                .attr("text-anchor", "middle")
                .attr("font-size", "11px") // Reduced to 80% of original 14px
                .attr("fill", "#000000") // Black text
                .attr("font-weight", "500") // Less bold (medium weight)
                .attr("font-family", "'JetBrains Mono', 'Fira Code', Consolas, monospace") // Modern coding font
                .attr("dominant-baseline", "middle")
                .attr("stroke", "none") // No stroke by default
                .attr("stroke-width", 0) // No stroke width
                .text(tokenText);
        } // Add subtle glow
        
        // Draw attention strands connecting adjacent layers
        this._renderAttentionStrands(nodeData, layerSpacing, tokenSpacing);
    }
    
    // Render attention strands connecting adjacent layers
    _renderAttentionStrands(nodeData, layerSpacing, tokenSpacing) {
        // Group nodes by layer
        const nodesByLayer = {};
        nodeData.forEach(node => {
            if (!nodesByLayer[node.layer]) {
                nodesByLayer[node.layer] = [];
            }
            nodesByLayer[node.layer].push(node);
        });
        
        const edgeData = [];
        const layersCount = this.config.modelDepth;
        const tokensCount = this.data.tokens.length;
        
        // Create edges connecting each layer to the layer below it
        for (let layerIdx = 0; layerIdx < layersCount - 1; layerIdx++) {
            // Find the layer data - use modulo to handle repeated layers due to generation steps
            const layerData = this.data.layers.find(layer => 
                (layer.index % layersCount) === layerIdx
            );
            
            if (!layerData) {
                console.warn(`No data found for layer ${layerIdx}`);
                continue;
            }
            
            // Only process heads that are visible
            const heads = layerData.heads.filter(head => this.visibleHeads.has(head.index));
            
            if (heads.length === 0) {
                console.warn(`No visible heads for layer ${layerIdx}`);
                continue;
            }
            
            // Process each head's attention weights
            heads.forEach(head => {
                if (!head.weights || !Array.isArray(head.weights)) {
                    console.warn(`Head ${head.index} has invalid weights`);
                    return;
                }
                
                // Filter weights by threshold
                head.weights.forEach(weight => {
                    if (!Array.isArray(weight) || weight.length < 3) {
                        return;
                    }
                    
                    const value = weight[2]; // The attention weight
                    if (value < this.config.threshold) {
                        return; // Skip if below threshold
                    }
                    
                    const queryIdx = weight[1];  // Query position (source)
                    const keyIdx = weight[0];    // Key position (target)
                    
                    // Verify indices are within bounds
                    if (queryIdx < 0 || queryIdx >= tokensCount || keyIdx < 0 || keyIdx >= tokensCount) {
                        console.warn(`Invalid token indices in weight: query=${queryIdx}, key=${keyIdx}, tokens length=${tokensCount}`);
                        return;
                    }
                    
                    // Find the source and target nodes
                    // Swap source/target to go from key position in current layer to query position in next layer
                    const sourceNode = nodesByLayer[layerIdx].find(n => n.token === keyIdx); // Key position in current layer
                    const targetNode = nodesByLayer[layerIdx + 1].find(n => n.token === queryIdx); // Query position in next layer
                    
                    if (!sourceNode || !targetNode) {
                        console.warn(`Could not find nodes for edge: layer=${layerIdx}, query=${queryIdx}, key=${keyIdx}`);
                        return;
                    }
                    
                    // Add the edge data
                    edgeData.push({
                        source: sourceNode,
                        target: targetNode,
                        weight: value,
                        headIndex: head.index,
                        edgeId: `edge-${layerIdx}-${head.index}-${keyIdx}-${queryIdx}` // Swap key/query in ID
                    });
                });
            });
        }
        
        // Draw the edges with improved aesthetic appearance
        this.edgeLayer.selectAll(".attention-strand")
            .data(edgeData, d => d.edgeId)
            .enter()
            .append("path")
            .attr("class", d => `attention-strand source-${d.source.token} target-${d.target.token} head-${d.headIndex}`)
            .attr("id", d => d.edgeId)
            .attr("d", d => {
                // Draw curved path from source to target with improved aesthetics
                const sourceX = d.source.x;
                const sourceY = d.source.y;
                const targetX = d.target.x;
                const targetY = d.target.y;
                
                // Add an increased offset to prevent exact overlaps of parallel strands
                const headOffset = (d.headIndex % 3 - 1) * 3.5; // Increased from 2 to 3.5
                const offsetSourceX = sourceX + headOffset;
                
                // Calculate control points for the curve with varying curvature
                if (Math.abs(sourceX - targetX) < 5) {
                    // For vertical strands (same token position) - increased curve for better separation
                    const controlOffset = 8 + (d.headIndex % 3) * 4; // Increased offset and variation
                    const controlX = sourceX + controlOffset;
                    const midY = (sourceY + targetY) / 2;
                    return `M ${offsetSourceX},${sourceY} 
                            C ${controlX},${midY} ${controlX},${midY} ${targetX},${targetY}`;
                }
                
                // For diagonal strands - more elegant curves
                const dx = targetX - sourceX;
                const dy = targetY - sourceY;
                const curvature = this.config.strandCurvature;
                
                // Enhanced curvature based on distance for better strand separation
                const controlY1 = sourceY + dy * (0.25 + (d.headIndex % 4) * 0.12);
                const controlY2 = targetY - dy * (0.25 + ((d.headIndex + 1) % 4) * 0.12);
                
                // Control points for Bézier curve with increased variation
                const controlX1 = sourceX + dx * curvature * (0.25 + (d.headIndex % 3) * 0.05);
                const controlX2 = targetX - dx * curvature * (0.25 + ((d.headIndex + 2) % 3) * 0.05);
                
                return `M ${offsetSourceX},${sourceY} 
                        C ${controlX1},${controlY1} ${controlX2},${controlY2} ${targetX},${targetY}`;
            })
            .attr("fill", "none")
            .attr("stroke", d => this.config.colors[d.headIndex])
            .attr("stroke-width", d => Math.max(this.config.strandWidth, d.weight * 1.2))
            .attr("opacity", d => Math.max(this.config.minEdgeOpacity, 
                                Math.min(this.config.maxEdgeOpacity, d.weight)))
            .on("mouseover", (event, d) => this._highlightEdge(event, d))
            .on("mouseout", () => this._unhighlightEdge());
    }
    
    // Highlight node and connected edges when hovering
    _highlightNode(node) {
        if (this.focusedToken !== null) return; // Don't highlight if a token is focused
        
        // Highlight the node with glow effect
        d3.select(`#${node.id}`)
            .attr("r", this.config.tokenRadius * 1.8)
            .attr("fill", "#fff")
            .attr("stroke", "#3498db")
            .attr("stroke-width", 2)
            .style("filter", "url(#glow)");
        
        // Highlight only connections to/from this specific node
        // With the corrected directionality:
        // - sourceNode = key (current layer)
        // - targetNode = query (next layer)
        this.edgeLayer.selectAll(".attention-strand")
            .filter(d => 
                (d.source.token === node.token && d.source.layer === node.layer) || 
                (d.target.token === node.token && d.target.layer === node.layer)
            )
            .attr("stroke-width", d => Math.max(2, d.weight * 3))
            .attr("opacity", 1)
            .style("filter", "url(#glow)")
            .raise(); // Bring to front
        
        // Fade unconnected edges
        this.edgeLayer.selectAll(".attention-strand")
            .filter(d => 
                !(d.source.token === node.token && d.source.layer === node.layer) && 
                !(d.target.token === node.token && d.target.layer === node.layer)
            )
            .attr("opacity", 0.05);
        
        // Highlight token label when hovered
        this.tokenLayer.selectAll(".token-group")
            .filter(function() {
                return d3.select(this).attr("data-index") == node.token;
            })
            .selectAll(".token-label-bg")
            .attr("fill", "#2a7dd2") // Blue highlight color
            .attr("stroke", "#ffffff") // White border
            .attr("stroke-width", 1.5); // Slightly thicker border
            
        // Highlight the token text - keep same font size but change to white for contrast
        this.tokenLayer.selectAll(".token-group")
            .filter(function() {
                return d3.select(this).attr("data-index") == node.token;
            })
            .selectAll(".token-label-text")
            .attr("fill", "#FFFFFF"); // Change to white text on blue background
            
        // Highlight the accent line
        this.tokenLayer.selectAll(".token-group")
            .filter(function() {
                return d3.select(this).attr("data-index") == node.token;
            })
            .selectAll(".token-label-accent")
            .attr("fill", "#ffffff") // White accent when highlighted
            .attr("height", 4); // Slightly taller
    }
    
    // Remove highlighting
    _unhighlightNode() {
        if (this.focusedToken !== null) return; // Don't unhighlight if a token is focused
        
        // Restore all nodes
        this.nodeLayer.selectAll(".grid-node")
            .attr("r", this.config.tokenRadius)
            .attr("fill", "#444")
            .attr("stroke", "#666")
            .attr("stroke-width", 1)
            .style("filter", "url(#glow)");
        
        // Restore all edges
        this.edgeLayer.selectAll(".attention-strand")
            .attr("stroke-width", d => Math.max(this.config.strandWidth, d.weight * 1.2))
            .attr("opacity", d => Math.max(this.config.minEdgeOpacity, 
                            Math.min(this.config.maxEdgeOpacity, d.weight)))
            .style("filter", null);
        
        // Restore token label background to default style
        this.tokenLayer.selectAll(".token-label-bg")
            .attr("fill", "#E0E0E0") // Light background
            .attr("stroke", "#555555") // Dark border
            .attr("stroke-width", 1) // Normal border
            .style("filter", "none"); // No shadow
            
        // Restore token text to default style
        this.tokenLayer.selectAll(".token-label-text")
            .attr("fill", "#000000"); // Black text
            
        // Restore accent line to default
        this.tokenLayer.selectAll(".token-label-accent")
            .attr("fill", "#5a9cd8") // Blue accent
            .attr("height", 3); // Default height
    }
    
    // Toggle focus on a node
    _toggleNodeFocus(node) {
        // Store the full node information (including layer) for focused node
        // Instead of just tracking the token index
        
        // If clicking on the already focused node, remove focus
        if (this.focusedToken !== null && 
            this.focusedToken.token === node.token && 
            this.focusedToken.layer === node.layer) {
            this.focusedToken = null;
            this._unhighlightNode();
            return;
        }
        
        // Focus on this specific node
        this.focusedToken = {
            token: node.token,
            layer: node.layer,
            id: node.id
        };
        
        // Reset all nodes
        this.nodeLayer.selectAll(".grid-node")
            .attr("r", this.config.tokenRadius)
            .attr("fill", "#444")
            .attr("stroke", "#666")
            .attr("stroke-width", 1)
            .style("filter", "url(#glow)");
        
        // Reset token label backgrounds to normal style
        this.tokenLayer.selectAll(".token-label-bg")
            .attr("fill", "#E0E0E0") // Light background
            .attr("stroke", "#555555") // Dark border
            .attr("stroke-width", 1) // Normal border
            .style("filter", "none"); // No shadow
            
        // Reset token text to default style
        this.tokenLayer.selectAll(".token-label-text")
            .attr("fill", "#000000"); // Black text
            
        // Reset accent lines to normal style
        this.tokenLayer.selectAll(".token-label-accent")
            .attr("fill", "#5a9cd8") // Blue accent
            .attr("height", 3); // Default height
        
        // Highlight only the selected node
        d3.select(`#${node.id}`)
            .attr("r", this.config.tokenRadius * 2)
            .attr("fill", "#fff")
            .attr("stroke", "#3498db")
            .attr("stroke-width", 2)
            .style("filter", "url(#glow)");
        
        // Highlight token background for focused state with bright blue
        this.tokenLayer.selectAll(".token-group")
            .filter(function() {
                return d3.select(this).attr("data-index") == node.token;
            })
            .selectAll(".token-label-bg")
            .attr("fill", "#0088ff") // Bright blue for focused state
            .attr("stroke", "#ffffff") // White border
            .attr("stroke-width", 2); // Thicker border
            
        // Focus state - keep text black for better readability
        this.tokenLayer.selectAll(".token-group")
            .filter(function() {
                return d3.select(this).attr("data-index") == node.token;
            })
            .selectAll(".token-label-text")
            .attr("fill", "#000000") // Black text
            .attr("font-weight", "600") // Semi-bold for focus state
            .attr("stroke", "none")
            .attr("stroke-width", 0);
            
        // Highlight accent for focused token
        this.tokenLayer.selectAll(".token-group")
            .filter(function() {
                return d3.select(this).attr("data-index") == node.token;
            })
            .selectAll(".token-label-accent")
            .attr("fill", "#ffffff") // White accent
            .attr("height", 4); // Taller accent
            
        // Bring the focused token group to front
        this.tokenLayer.selectAll(".token-group")
            .filter(function() {
                return d3.select(this).attr("data-index") == node.token;
            })
            .raise(); // Brings the element to the front
        
        // Reset all edges
        this.edgeLayer.selectAll(".attention-strand")
            .attr("stroke-width", d => Math.max(this.config.strandWidth, d.weight * 1.2))
            .attr("opacity", 0.05) // Fade all edges more
            .style("filter", null);
        
        // Highlight only edges connected to this specific node
        // With the corrected directionality:
        // - source = key position in current layer
        // - target = query position in next layer
        this.edgeLayer.selectAll(".attention-strand")
            .filter(d => 
                // Only highlight edges connected to this specific node
                (d.source.token === node.token && d.source.layer === node.layer) || 
                (d.target.token === node.token && d.target.layer === node.layer)
            )
            .attr("stroke-width", d => Math.max(2, d.weight * 3))
            .attr("opacity", 0.9)
            .style("filter", "url(#glow)")
            .raise(); // Bring to front
    }
    
    // Highlight edge on hover
    _highlightEdge(event, edge) {
        if (this.focusedToken !== null) return; // Don't highlight if a token is focused
        
        try {
            // Highlight the edge with glow effect - check if edge exists first
            const edgeElement = d3.select(`#${edge.edgeId}`);
            if (!edgeElement.empty()) {
                edgeElement
                    .attr("stroke-width", Math.max(2, edge.weight * 3))
                    .attr("opacity", 1)
                    .style("filter", "url(#glow)")
                    .raise(); // Bring to front
            }
            
            // Highlight source node - check if node exists first
            const sourceElement = d3.select(`#${edge.source.id}`);
            if (!sourceElement.empty()) {
                sourceElement
                    .attr("r", this.config.tokenRadius * 1.5)
                    .attr("fill", this.config.colors[edge.headIndex])
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 2)
                    .style("filter", "url(#glow)");
            }
                
            // Highlight target node - check if node exists first
            const targetElement = d3.select(`#${edge.target.id}`);
            if (!targetElement.empty()) {
                targetElement
                    .attr("r", this.config.tokenRadius * 1.5)
                    .attr("fill", this.config.colors[edge.headIndex])
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 2)
                    .style("filter", "url(#glow)");
            }
            
            // Highlight token labels with head color
            this.tokenLayer.selectAll(".token-group")
                .filter(function() {
                    const index = parseInt(d3.select(this).attr("data-index"));
                    return index === edge.source.token || index === edge.target.token;
                })
                .selectAll(".token-label-bg")
                .attr("fill", this.config.colors[edge.headIndex]) // Use actual head color
                .attr("stroke", "#ffffff")
                .attr("stroke-width", 1.5);
                
            // Keep text black for better readability
            this.tokenLayer.selectAll(".token-group")
                .filter(function() {
                    const index = parseInt(d3.select(this).attr("data-index"));
                    return index === edge.source.token || index === edge.target.token;
                })
                .selectAll(".token-label-text")
                .attr("fill", "#000000") // Black text
                .attr("font-weight", "600") // Semi-bold for emphasis
                .attr("stroke", "none")
                .attr("stroke-width", 0);
                
            // Fade other edges
            this.edgeLayer.selectAll(".attention-strand")
                .filter(d => d.edgeId !== edge.edgeId)
                .attr("opacity", 0.1);
            
            // Show tooltip with edge info
            this._showTooltip(event, edge);
        } catch (e) {
            console.error("Error in _highlightEdge:", e);
            // Fail gracefully - don't crash if there's an error
        }
    }
    
    // Remove edge highlighting
    _unhighlightEdge() {
        if (this.focusedToken !== null) return; // Don't unhighlight if a token is focused
        
        try {
            // Restore edge styling
            this.edgeLayer.selectAll(".attention-strand")
                .attr("stroke-width", d => Math.max(this.config.strandWidth, d.weight * 1.2)) // Use consistent multiplier
                .attr("opacity", d => Math.max(this.config.minEdgeOpacity, 
                                Math.min(this.config.maxEdgeOpacity, d.weight)))
                .style("filter", null);
            
            // Restore node styling
            this.nodeLayer.selectAll(".grid-node")
                .attr("r", this.config.tokenRadius)
                .attr("fill", "#444")
                .attr("stroke", "#666")
                .attr("stroke-width", 1)
                .style("filter", "url(#glow)");
            
            // Restore token label backgrounds to light style
            this.tokenLayer.selectAll(".token-label-bg")
                .attr("fill", "#E0E0E0") // Light background
                .attr("stroke", "#555555") // Dark border
                .attr("stroke-width", 1); // Normal border
            
            // Restore token text to black and remove any stroke
            this.tokenLayer.selectAll(".token-label-text")
                .attr("fill", "#000000") // Black text
                .attr("font-weight", "500") // Medium weight
                .attr("stroke", "none") // Remove any stroke outline
                .attr("stroke-width", 0) // Remove stroke width
                .style("filter", null);
                
            // Restore accent line to default
            this.tokenLayer.selectAll(".token-label-accent")
                .attr("fill", "#5a9cd8") // Blue accent
                .attr("height", 3); // Default height
            
            // Remove tooltip completely rather than just hiding it
            d3.selectAll(".attention-tooltip").remove();
        } catch (e) {
            console.error("Error in _unhighlightEdge:", e);
            // Fail gracefully
        }
    }
    
    // Show tooltip with enhanced attention details
    _showTooltip(event, d) {
        try {
            // Remove any existing tooltip first to prevent stale tooltips
            d3.select("body").selectAll(".attention-tooltip").remove();
            
            // Create a fresh tooltip
            let tooltip = d3.select("body").append("div")
                .attr("class", "attention-tooltip")
                .style("opacity", 0);
        
        // Create a colored indicator for the head
        const headColor = this.config.colors[d.headIndex];
        
        // Get correct layer position (layers are numbered from the top, so we need to invert)
        const layerPosition = this.config.modelDepth - d.source.layer;
        
        // Get tokenCount for boundary checks
        const tokensCount = this.data.tokens.length;
        
        // Get attention pattern type based on positions
        const isLocalAttention = d.source.token === d.target.token;
        const tokenDistance = Math.abs(d.source.token - d.target.token);
        
        // Categorize attention by range
        let attentionPattern;
        if (isLocalAttention) {
            attentionPattern = "Self-attention";
        } else if (tokenDistance === 1) {
            attentionPattern = "Adjacent token";
        } else if (tokenDistance > 5) {
            attentionPattern = "Long-range";
        } else {
            attentionPattern = "Mid-range";
        }
        
        // Determine direction (right/left)
        const direction = !isLocalAttention ? 
            (d.target.token > d.source.token ? "→ Right" : "← Left") : "";
            
        // Calculate normalized attention score (0-100)
        const attentionScore = Math.min(100, Math.round(d.weight * 100));
        
        // Generate a qualitative insight based on the attention pattern
        let insight = "";
        if (isLocalAttention) {
            insight = "Self-attention: token processing its own features";
        } else if (d.target.token === d.source.token + 1 && d.weight > 0.7) {
            insight = "Adjacent right: possible word/subword completion";
        } else if (d.target.token === d.source.token - 1 && d.weight > 0.7) {
            insight = "Adjacent left: context refinement from previous token";
        } else if (tokenDistance > 3 && d.weight > 0.85) {
            // Check if attending to beginning of sequence
            if (d.source.token <= 1) {
                insight = "Attending to sequence start token";
            } else if (d.source.token === tokensCount - 1) {
                insight = "Attending to last token in context window";
            } else {
                insight = "Long-distance connection: possible semantic link";
            }
        } 
        
        // Add layer-specific observations
        if (layerPosition <= 2 && !insight) {
            insight = "Early layer: extracting low-level patterns";
        } else if (layerPosition >= 10 && !insight) {
            insight = "Deep layer: forming high-level representations";
        }
        
        // Build the tooltip HTML with more focused information
        tooltip.html(`
            <div style="background: linear-gradient(to right, ${headColor}33, transparent); padding: 8px; margin: -10px -10px 10px -10px; border-radius: 5px 5px 0 0;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center;">
                        <div style="width: 12px; height: 12px; background-color: ${headColor}; border-radius: 50%; margin-right: 8px;"></div>
                        <span style="font-weight: bold; color: #fff;">Head ${d.headIndex + 1}</span>
                    </div>
                    <div style="color: #ddd; font-size: 13px;">Layer ${layerPosition}</div>
                </div>
            </div>
            
            <div style="display: flex; align-items: center; margin-bottom: 6px;">
                <div style="flex: 1;">
                    <div style="font-size: 12px; color: #999;">Pattern</div>
                    <div style="color: #fff; font-weight: bold;">${attentionPattern} ${direction}</div>
                </div>
                <div style="flex: 1; text-align: right;">
                    <div style="font-size: 12px; color: #999;">Strength</div>
                    <div style="color: #fff; font-weight: bold;">${attentionScore}%</div>
                </div>
            </div>
            
            ${insight ? `
            <div style="background: rgba(0,0,0,0.2); border-radius: 4px; padding: 6px; margin: 8px 0;">
                <div style="color: #ddd; font-style: italic;">${insight}</div>
            </div>
            ` : ''}
            
            <div style="display: flex; margin-top: ${insight ? '6px' : '12px'};">
                <div style="flex: 1; border-right: 1px solid #333; padding-right: 8px;">
                    <div style="color: #999; font-size: 11px;">Key</div>
                    <div style="color: #fff; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">"${d.source.tokenText}"</div>
                </div>
                <div style="flex: 1; padding-left: 8px;">
                    <div style="color: #999; font-size: 11px;">Query</div>
                    <div style="color: #fff; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">"${d.target.tokenText}"</div>
                </div>
            </div>
        `)
        .style("background-color", "rgba(20, 20, 20, 0.95)")
        .style("color", "#aaa")
        .style("border", "1px solid #333")
        .style("border-radius", "5px")
        .style("padding", "10px")
        .style("font-family", "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif")
        .style("font-size", "13px")
        .style("box-shadow", "0 3px 15px rgba(0, 0, 0, 0.4)")
        .style("backdrop-filter", "blur(8px)")
        .style("width", "300px")
        .style("max-width", "350px")
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 10) + "px")
        .style("z-index", "1000")
        .style("opacity", 1); // Set opacity immediately, no transition for better reliability

        } catch (e) {
            console.error("Error in _showTooltip:", e);
            // Fail gracefully
        }
    }
    
    // Hide tooltip - we now completely remove it for reliability
    _hideTooltip() {
        try {
            // Instead of hiding, completely remove tooltips to prevent stale ones
            d3.selectAll(".attention-tooltip").remove();
        } catch (e) {
            console.error("Error in _hideTooltip:", e);
        }
    }
    
    // Load data and render visualization
    loadData(data) {
        try {
            // Clear existing visualization elements
            this.nodeLayer.selectAll("*").remove();
            this.edgeLayer.selectAll("*").remove();
            this.tokenLayer.selectAll("*").remove();
            
            console.log("Loading data for static grid visualization");
            this.data = data;
            
            // Determine the number of heads from the data
            const numHeads = data.layers[0]?.heads?.length || 12;
            
            // Configure the visible heads
            this.visibleHeads = new Set(Array.from({length: numHeads}, (_, i) => i));
            
            // Set up head toggles with the new design
            this._renderHeadToggles();
            
            // Use higher default threshold (already set in HTML)
            const thresholdSlider = document.getElementById('threshold-slider');
            if (thresholdSlider) {
                this.config.threshold = parseFloat(thresholdSlider.value);
            }
            
            // Render the grid visualization
            this.renderVisualization();
            
            console.log("Grid visualization rendered successfully");
        } catch (error) {
            console.error("Error loading data:", error);
        }
        
        // Setup threshold slider
        const thresholdSlider = document.getElementById('threshold-slider');
        const thresholdValue = document.getElementById('threshold-value');
        
        if (thresholdSlider && thresholdValue) {
            thresholdSlider.addEventListener('input', (e) => {
                this.config.threshold = parseFloat(e.target.value);
                thresholdValue.textContent = this.config.threshold.toFixed(2);
                this.renderVisualization();
            });
        }
    }
    
    // Render head toggle controls
    _renderHeadToggles() {
        const self = this;
        const numHeads = this.data.layers[0]?.heads?.length || 12;
        
        const toggleContainer = d3.select("#head-toggles");
        toggleContainer.html(""); // Clear existing
        
        // Add a toggle for each head in a more compact design
        for (let i = 0; i < numHeads; i++) {
            const label = toggleContainer.append("label")
                .attr("class", "head-toggle")
                .style("border-color", this.config.colors[i])
                .style("color", this.config.colors[i]);
            
            label.append("input")
                .attr("type", "checkbox")
                .attr("data-head", i)
                .property("checked", true)
                .on("change", function() {
                    const isChecked = d3.select(this).property("checked");
                    if (isChecked) {
                        self.visibleHeads.add(i);
                    } else {
                        self.visibleHeads.delete(i);
                    }
                    
                    // Update label appearance based on checked state
                    d3.select(this.parentNode)
                        .style("background-color", isChecked ? `${self.config.colors[i]}33` : "rgba(40, 40, 40, 0.8)")
                        .style("border-color", isChecked ? self.config.colors[i] : "transparent");
                        
                    self.renderVisualization();
                });
            
            label.append("span")
                .text(`${i+1}`); // Just the number for compactness
                
            // Initialize background color based on checked state
            label.style("background-color", `${this.config.colors[i]}33`);
        }
        
        // Add compact All/None controls
        toggleContainer.append("div")
            .attr("class", "head-toggle-controls")
            .style("margin-top", "8px")
            .style("display", "flex")
            .style("gap", "5px")
            .html(`
                <a href="#" style="font-size: 11px; color: #3498db; text-decoration: none;">All</a> | 
                <a href="#" style="font-size: 11px; color: #3498db; text-decoration: none;">None</a>
            `);
        
        // Set up click handlers
        toggleContainer.select("a:nth-child(1)").on("click", function(event) {
            event.preventDefault();
            toggleContainer.selectAll("input[type=checkbox]")
                .property("checked", true);
                
            // Update all toggle backgrounds
            toggleContainer.selectAll(".head-toggle").each(function(d, i) {
                d3.select(this).style("background-color", `${self.config.colors[i]}33`)
                               .style("border-color", self.config.colors[i]);
            });
                
            self.visibleHeads = new Set(Array.from({length: numHeads}, (_, i) => i));
            self.renderVisualization();
        });
        
        toggleContainer.select("a:nth-child(2)").on("click", function(event) {
            event.preventDefault();
            toggleContainer.selectAll("input[type=checkbox]")
                .property("checked", false);
                
            // Update all toggle backgrounds
            toggleContainer.selectAll(".head-toggle").each(function() {
                d3.select(this).style("background-color", "rgba(40, 40, 40, 0.8)")
                               .style("border-color", "transparent");
            });
                
            self.visibleHeads = new Set();
            self.renderVisualization();
        });
    }
}

// Main initialization function for the static grid visualization
function initializeGridVisualization(data) {
    try {
        const container = document.getElementById("visualization");
        
        if (!container) {
            console.error("Visualization container not found");
            return;
        }
        
        // Get container dimensions
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // Log important details about the container
        console.log(`Grid visualization container dimensions: ${containerWidth}x${containerHeight}`);
        
        // Calculate ideal token spacing based on the number of tokens
        const tokenCount = data.tokens.length;
        const maxTokensVisible = 20; // Maximum number of tokens to display without scrolling
        
        // Adaptive token spacing that gets smaller with more tokens
        let tokenSpacing = 60; // Default spacing
        if (tokenCount > 5) {
            // Gradually reduce spacing for longer sequences
            tokenSpacing = Math.max(35, Math.min(60, Math.floor(containerWidth / Math.min(maxTokensVisible, tokenCount))));
        }
        
        // Create the visualization object with optimal parameters
        const viz = new StaticGridVisualization("visualization", {
            width: containerWidth,
            height: containerHeight,
            // Dynamic calculation of spacing based on container and content
            tokenSpacing: tokenSpacing * 1.2, // Increased horizontal spacing by 20%
            // Other parameters are calculated in the constructor
            modelDepth: 12,
            // Visual enhancements
            strandCurvature: 0.7, // Increased for better strand separation
            strandWidth: 0.3,  // Even thinner strands (reduced by 50%)
            minEdgeOpacity: 0.25, // Slightly increased for better visibility
            maxEdgeOpacity: 0.95, // Slightly reduced for better visual balance
            // Use higher default threshold
            threshold: 0.98
        });
        
        // Load the data and render
        console.log("Loading data into grid visualization...");
        viz.loadData(data);
        console.log("Grid visualization initialized successfully!");
    } catch (error) {
        console.error("Error initializing grid visualization:", error);
        throw error;
    }
}