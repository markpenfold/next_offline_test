'use client';
import { useRef, useEffect, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useUIStore } from '@/stores/useUIStore';
import SpriteText from 'three-spritetext';
import { Group } from 'three';
import { GraphNode, LINK_TYPES } from '@/components/omenland/omenTypes';
import { NodeObject } from 'react-force-graph-3d';
import { Focus, ZoomIn, ZoomOut, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { useDATAStore } from '@/stores/useDataStore';
import styles from './graph.module.css';

// Dynamic import to avoid SSR issues with canvas
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
});


// Calculate center point of nodes
const calcCenter = (nodes: GraphNode[]) => {
  if (nodes.length === 0) return { x: 0, y: 0, z: 0 };
  const sum = nodes.reduce((acc, n) => ({
    x: acc.x + (n.x || 0),
    y: acc.y + (n.y || 0),
    z: acc.z + (n.z || 0)
  }), { x: 0, y: 0, z: 0 });
  return { x: sum.x / nodes.length, y: sum.y / nodes.length, z: sum.z / nodes.length };
};

const GraphView = () => {

  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevNodesRef = useRef<Map<string, GraphNode>>(new Map());  // Cache nodes to preserve positions
  const [dimensions, setDimensions] = useState({ width: 400, height: 300 });
  const [webGLError, setWebGLError] = useState(false);

  // Cleanup WebGL context on unmount to prevent context exhaustion
  useEffect(() => {
    return () => {
      if (graphRef.current) {
        // Force graph cleanup
        const renderer = graphRef.current.renderer?.();
        if (renderer) {
          renderer.dispose();
          renderer.forceContextLoss();
        }
      }
    };
  }, []);

  // Track container size for canvas resizing
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Store subscriptions
  const timelineBuilderEvents = useUIStore((state) => state.timelineBuilderEvents);
  const getCollectionColor = useDATAStore((state) => state.getSlotColor);
  const graphData = useUIStore((state) => state.graphData);
  const setGraphData = useUIStore((state) => state.setGraphData);
  const addEventLink = useUIStore((state) => state.addEventLink);
  const selectedNode = useUIStore((state) => state.selectedNode);
  const setSelectedNode = useUIStore((state) => state.setSelectedNode);
  const setHoveredNode = useUIStore((state) => state.setHoveredNode);
  const selectedLink = useUIStore((state) => state.selectedLink);
  const setSelectedLink = useUIStore((state) => state.setSelectedLink);
  const updateEventGraphPosition = useUIStore((state) => state.updateEventGraphPosition);

  // Sync node highlighting when selectedNode changes (e.g., from editor click)
  useEffect(() => {
    if (!graphRef.current) return;

    // Skip if already showing the right selection
    const currentRefId = selectedNodeRef.current ? String(selectedNodeRef.current.id) : null;
    if (currentRefId === selectedNode) return;

    // Reset previous selection
    if (selectedNodeRef.current) {
      selectedNodeRef.current.color = selectedNodeRef.current.saved_col;
      selectedNodeRef.current = null;
    }

    // Highlight new selection
    if (selectedNode) {
      const node = graphData.nodes.find(n => String(n.id) === selectedNode);
      if (node) {
        node.color = '#ff0000';
        selectedNodeRef.current = node;
      }
    }

    graphRef.current.refresh?.();
  }, [selectedNode, graphData.nodes]);

  // Refocus graph on window resize
  useEffect(() => {
    const handleResize = () => {
      graphRef.current?.zoomToFit(400, 350); // 150px padding
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);



  //////////////////////////////////////////////////////////////////////////////////////////
  // Load graph data from timelineBuilderEvents
  // Note: Limited to 100 nodes for performance
  // Builds both nodes and links from event data
  //////////////////////////////////////////////////////////////////////////////////////////
  useEffect(() => {
    const limitedEvents = timelineBuilderEvents.slice(0, 100);

    // Use our cached ref for previous nodes (preserves positions)
    const prevNodesById = prevNodesRef.current;
    const isInitialLoad = prevNodesById.size === 0 && limitedEvents.length > 0;

    // Grid settings for nodes without saved positions
    const nodesPerColumn = 10;
    const columnSpacing = 100;  // horizontal distance between columns
    const rowSpacing = 30;     // vertical distance between nodes in a column

    // map the limited events
    const nodes: GraphNode[] = limitedEvents.map((event, index): GraphNode => {
      const nodeId = event._id.toString();
      const baseColor = getCollectionColor(event.fileName) || '#3b82f6';

      const existingNode = prevNodesById.get(nodeId);
      if (existingNode) {
        // Update fields that may change, but keep position (x, y, z, fx, fy, fz)
        existingNode.name = event.subject;
        existingNode.description = event.description || '';
        existingNode.saved_col = baseColor;
        return existingNode;
      }

      // If node doesn't exist, create new node
      const savedPos = event.graphNodePosition;

      // Calculate grid position: Y varies first, then X shifts right every nodesPerColumn
      const col = Math.floor(index / nodesPerColumn);  // which column (moves right)
      const row = index % nodesPerColumn;              // position within column (moves down)

      // Odd columns shift up to stagger text and avoid overlap
      const staggerOffset = (col % 2 === 1) ? -(rowSpacing / 2) : 0;

      const gridX = col * columnSpacing;
      const gridY = row * rowSpacing + staggerOffset;
      const gridZ = 0;

      return {
        id: nodeId,
        name: event.subject,
        year: event.year
          ? event.year > 0
            ? `${event.year} AD`
            : `${Math.abs(event.year)} BC`
          : '',
        val: 3,
        color: baseColor,
        saved_col: baseColor,
        description: event.description || '',
        // Use saved position if available, otherwise use grid position
        x: savedPos?.x ?? gridX,
        y: savedPos?.y ?? gridY,
        z: savedPos?.z ?? gridZ,
        fx: savedPos?.x ?? gridX,
        fy: savedPos?.y ?? gridY,
        fz: savedPos?.z ?? gridZ,
      };
    });

    // On initial load from persistence, re-center nodes at origin so camera looks at them
    if (isInitialLoad && nodes.length > 0) {
      const center = calcCenter(nodes);
      nodes.forEach(n => {
        n.x = (n.x || 0) - center.x;
        n.y = (n.y || 0) - center.y;
        n.z = (n.z || 0) - center.z;
        n.fx = n.x;
        n.fy = n.y;
        n.fz = n.z;
      });
    }

    // Update our cache with the new nodes
    prevNodesRef.current = new Map(nodes.map(n => [String(n.id), n]));


    // Build links from each event's linkedTo array
    // Handle both old string format and new EventLink format for backward compatibility
    const rawLinks: { source: string; target: string; linkType: string; weight: number; color: string }[] = [];

    limitedEvents.forEach(event => {
      (event.linkedTo || []).forEach(link => {
        const targetId = typeof link === 'string' ? link : link.targetId;
        const linkType = typeof link === 'string' ? 'contributing_factor' : link.linkType;
        const weight = typeof link === 'string' ? 0 : link.weight;

        // Skip invalid links (missing targetId)
        if (!targetId) return;

        rawLinks.push({
          source: event._id.toString(),
          target: targetId,
          linkType,
          weight,
          color: LINK_TYPES[linkType]?.color || '#eeeeee'
        });
      });
    });

    // Assign curvature to parallel links so they don't overlap
    const linkCounts: Record<string, number> = {};
    const links = rawLinks.map(link => {
      // Create a key for this pair (order-independent)
      const pairKey = [link.source, link.target].sort().join('-');
      const index = linkCounts[pairKey] || 0;
      linkCounts[pairKey] = index + 1;

      // Alternate positive/negative curvature: 0, 0.2, -0.2, 0.4, -0.4...
      const curvature = index === 0 ? 0 : (Math.ceil(index / 2) * 0.2 * (index % 2 === 1 ? 1 : -1));

      return { ...link, curvature };
    });

    setGraphData({ nodes, links });
  }, [timelineBuilderEvents, getCollectionColor, setGraphData]);

  // Force graph refresh when node count changes (handles removals)
  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.refresh?.();
    }
  }, [graphData.nodes.length]);



//////////////////////////////////////////////////////////////////////////////////////////
// NODE HAS BEEN CLICKED => NOW WHAT? ////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////
const selectedNodeRef = useRef<any>(null);

const handleNodeClick = useCallback((node: any) => {
  if (!node || !graphRef.current) return;

  // Reset old node
  if (selectedNodeRef.current && selectedNodeRef.current !== node) {
    selectedNodeRef.current.color = selectedNodeRef.current.saved_col;
  }

  // Toggle
  if (selectedNodeRef.current === node) {
    node.color = node.saved_col;
    selectedNodeRef.current = null;
    setSelectedNode(null);
  } else {
    node.color = '#ff0000';
    selectedNodeRef.current = node;
    setSelectedNode(node.id);
  }

  graphRef.current.refresh?.();
}, [setSelectedNode]);

///////////////////////////////////////////////////////////
/// HELPERS FOR ADDING LINKS DURING DEVELOPMENT ///////////
///////////////////////////////////////////////////////////
function pickRandomOtherNodeId(
  nodes: GraphNode[],
  currentId: string | number
): string | number | null {
  const candidates = nodes.filter(n => n.id !== currentId);
  if (candidates.length === 0) return null;

  const randomNode =
    candidates[Math.floor(Math.random() * candidates.length)];

  return randomNode.id;
}



  const handleNodeRightClick = useCallback((node: NodeObject & Partial<GraphNode>,  _event: MouseEvent) => {
    if (!node) return;

    const graphNode = node as GraphNode;
    const targetId = pickRandomOtherNodeId(graphData.nodes, String(graphNode.id));
    if (!targetId) return;

    // Add link to the event's linkedTo array (this will trigger useEffect to rebuild graph)
    addEventLink(String(graphNode.id), String(targetId));
  }, [addEventLink, graphData.nodes]);


///////////////////////////////////////////////////////////
// END HELPERS ////////////////////////////////////////////
///////////////////////////////////////////////////////////
  
  const handleLinkClick = useCallback((link: any) => {
    // Extract IDs - link.source/target can be node objects or strings depending on graph state
    const sourceId = typeof link.source === 'object' ? String(link.source.id) : String(link.source);
    const targetId = typeof link.target === 'object' ? String(link.target.id) : String(link.target);
    const linkType = link.linkType || 'contributing_factor';

    // Toggle: if clicking the same link, deselect it
    if (selectedLink?.sourceId === sourceId &&
        selectedLink?.targetId === targetId &&
        selectedLink?.linkType === linkType) {
      setSelectedLink(null);
    } else {
      setSelectedLink({ sourceId, targetId, linkType });
    }
  }, [selectedLink, setSelectedLink]);

  const handleNodeDragEnd = useCallback((node: any) => {
    // Pin the node in place after dragging
    node.fx = node.x;
    node.fy = node.y;
    node.fz = node.z;
    // Persist position to store
    updateEventGraphPosition(String(node.id), node.x, node.y, node.z);
  }, [updateEventGraphPosition]);


  ////////////////////////////////////////////////
  /// recenters the camera on the graph nodes
  ////////////////////////////////////////////////
  const handleRefocus = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;

    // Get current camera position to preserve zoom distance
    const camPos = graph.cameraPosition();
    const currentDistance = Math.sqrt(camPos.x ** 2 + camPos.y ** 2 + camPos.z ** 1.6);

    // Use our cached nodes from prevNodesRef
    const nodes = Array.from(prevNodesRef.current.values());
    if (nodes.length === 0) return;

    const center = calcCenter(nodes);

    // Reposition camera at same distance, looking at center of nodes
    graph.cameraPosition(
      { x: center.x, y: center.y, z: center.z + currentDistance },
      center,
      400
    );
  }, []);

  ////////////////////////////////////////////////
  /// pan control for camera on graph nodes
  ////////////////////////////////////////////////
  const handlePan = useCallback((deltaX: number, deltaY: number) => {
    const graph = graphRef.current;
    if (!graph) return;
  
    const currentPos = graph.cameraPosition();
    const controls = graph.controls();
    const target = controls?.target || { x: 0, y: 0, z: 0 };
  
    // Shift both camera position and OrbitControls target point together
    const newTarget = {
      x: target.x + deltaX,
      y: target.y + deltaY,
      z: target.z,
    };
  
    graph.cameraPosition(
      {
        x: currentPos.x + deltaX,
        y: currentPos.y + deltaY,
        z: currentPos.z,
      },
      newTarget,
      200
    );
  }, []);


  ////////////////////////////////////////////////
  // Zoom control for Graph Node camera //////////
  ////////////////////////////////////////////////
  const handleZoom = useCallback((zoomFactor: number) => {
    const graph = graphRef.current;
    if (!graph) return;
  
    const currentPos = graph.cameraPosition();
    const lookAt = graph.controls()?.target || { x: 0, y: 0, z: 0 };
  
    // Calculate direction vector from target to camera
    const dx = currentPos.x - lookAt.x;
    const dy = currentPos.y - lookAt.y;
    const dz = currentPos.z - lookAt.z;
  
    // Adjust camera distance by factor
    graph.cameraPosition(
      {
        x: lookAt.x + dx * zoomFactor,
        y: lookAt.y + dy * zoomFactor,
        z: lookAt.z + dz * zoomFactor,
      },
      lookAt,
      300 // transition duration in ms
    );
  }, []);


  ////////////////////////////////////////////////
  // Check WebGL availability on mount ///////////
  ////////////////////////////////////////////////
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setWebGLError(true);
      }
    } catch {
      setWebGLError(true);
    }
  }, []);


  // Early return for WebGL error (must be after all hooks)
  if (webGLError) {
    return (
      <div className={styles.webglError}>
        <div className={styles.webglErrorContent}>
          <p>WebGL not available</p>
          <p className={styles.webglErrorSubtext}>Try refreshing or closing other browser tabs</p>
        </div>
      </div>
    );
  }

////////////////////////////////////////////////
// END WEBGL COPING MECHANISMS /////////////////
////////////////////////////////////////////////

  return (
    <div ref={containerRef} className={styles.graphContainer}>
        <div className={styles.controlsOverlay}>
          {/* Refocus */}
          <button onClick={handleRefocus} title="Refocus camera">
            <Focus size={14} />
          </button>

          {/* Zoom Controls */}
          <button onClick={() => handleZoom(0.7)} title="Zoom In">
            <ZoomIn size={14} />
          </button>
          <button onClick={() => handleZoom(1.3)} title="Zoom Out">
            <ZoomOut size={14} />
          </button>

          {/* Directional Pan Controls */}
          <button onClick={() => handlePan(0, 30)} title="Pan Up">
            <ArrowUp size={14} />
          </button>
          <button onClick={() => handlePan(0, -30)} title="Pan Down">
            <ArrowDown size={14} />
          </button>
          <button onClick={() => handlePan(-30, 0)} title="Pan Left">
            <ArrowLeft size={14} />
          </button>
          <button onClick={() => handlePan(30, 0)} title="Pan Right">
            <ArrowRight size={14} />
          </button>
        </div>

        <ForceGraph3D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          onNodeDragEnd={handleNodeDragEnd}
          onNodeClick={handleNodeClick}
          onNodeRightClick={handleNodeRightClick}
          onLinkClick={handleLinkClick}
          onNodeHover={(node: any) => setHoveredNode(node ? String(node.id) : null)}
         
          nodeColor={(node: any) => node.color}
          nodeVal={(node: any) => node.val}
          nodeRelSize={2}
          nodeOpacity={1.0}
          linkColor={(link: any) => link.color || '#eeeeee'}
          linkOpacity={1.0}
          linkWidth={(link: any) => {
            const weight = link.weight ?? 0;
            // Map weight -100..+100 to thickness 0.2..2.5
            const minWidth = 0.2;
            const maxWidth = 2.5;
            return minWidth + ((weight + 100) / 200) * (maxWidth - minWidth);
          }}
          linkCurvature={(link: any) => link.curvature || 0}
          linkDirectionalArrowLength={8}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticles={0}
          linkLabel={(link: any) => LINK_TYPES[link.linkType]?.label || link.linkType}
          backgroundColor="rgb(41,41,41)"
          showNavInfo={true}
          enableNodeDrag={true}
          enableNavigationControls={true}
          nodeId='id'
          nodeThreeObjectExtend={true}
          nodeLabel={(node: any) => node.description}
          nodeThreeObject={node => {
            // Create a group to hold both text sprites
            const group = new Group();

            if (node.year) {
              // Year in blue
              const yearSprite = new SpriteText(node.year);
              yearSprite.color = '#6977dd'; // Menubar blue
              yearSprite.textHeight = 6;
              yearSprite.position.y = 10; // Position above
              group.add(yearSprite);

              // Event text in white
              const eventSprite = new SpriteText(node.name);
              eventSprite.color = '#ffffff'; // White
              eventSprite.textHeight = 5;
              eventSprite.position.y = -10; // Position below
              group.add(eventSprite);
            } else {
              // No year, just show event text
              const sprite = new SpriteText(node.name);
              sprite.color = '#ffffff';
              sprite.textHeight = 8;
              group.add(sprite);
            }

            return group;
          }}
          
        />
      
    </div>
  );
};

export default GraphView;