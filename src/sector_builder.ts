import { BSPNode, BSPPlane, Linedef, Subsector, Vertex } from "./doomdata";

interface SubsectorPolygons {
    vertices: Vertex[],
    indices: number[],
    subsector: Subsector
}

function triangulate(vertices: Vertex[]) {
    const indices: number[] = [];
    for (let i = 1; i < vertices.length - 1; i++) {
        indices.push(0, i + 0, i + 1);
    }
    return indices;
}

function process_subsector(subsector: Subsector, bsp_nodes: BSPPlane[]): SubsectorPolygons {
    const minx = -100000;
    const miny = -100000;
    const maxx = 100000;
    const maxy = 100000;
    let vertices: Vertex[] = [
        { x: minx, y: miny }, { x: maxx, y: miny },
        { x: maxx, y: maxy }, { x: minx, y: maxy },
    ];

    // 1. Split by segs
    for (const seg of subsector.segs) {
        const seg_plane = new BSPPlane(seg.start, seg.start.x - seg.end.x, seg.start.y - seg.end.y);
        vertices = seg_plane.sutherland_hodgman(vertices);
    }

    // 2. Split by bsp nodes
    for (const plane of bsp_nodes) {
        vertices = plane.sutherland_hodgman(vertices);
    }

    // 3. Triangulate (i.e. create indices)
    const indices = triangulate(vertices);

    return { vertices, indices, subsector };
};

export function build_sectors(subsectors: Subsector[], nodes: BSPNode[]) {
    const sector_polygons = new Map<number, SubsectorPolygons[]>();

    function build_sectors_aux(node: BSPNode, planes_so_far: BSPPlane[]) {
        process_child(node.right_child_index, [...planes_so_far, node.right_plane]);
        process_child(node.left_child_index, [...planes_so_far, node.left_plane]);
    };

    function process_child(child_index: number, planes: BSPPlane[]) {
        const is_subsector = (child_index & 0x8000) === 0x8000;
        const index = child_index & 0x7FFF;
        if (is_subsector) {
            const subsector = subsectors[index];
            const subsector_polygons = process_subsector(subsector, planes);
            const existing_polygons = sector_polygons.get(subsector.sector.index) || [];
            existing_polygons.push(subsector_polygons);
            sector_polygons.set(subsector.sector.index, existing_polygons);
        }
        else {
            build_sectors_aux(nodes[index], planes);
        }
    }

    build_sectors_aux(nodes[nodes.length - 1], []);

    return sector_polygons;
}
