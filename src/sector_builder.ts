import { BSPNode, BSPPlane, Subsector, Vertex } from "./doomdata";

type Line = { a: Vertex, b: Vertex, color: string };

function process_subsector(subsector: Subsector, bsp_nodes: BSPPlane[]) {
    const minx = -1000000;
    const miny = -1000000;
    const maxx = 1000000;
    const maxy = 1000000;
    let clipped_vertices = [
        { x: minx, y: miny }, { x: maxx, y: miny },
        { x: maxx, y: maxy }, { x: minx, y: maxy },
    ];

    for (const seg of subsector.segs) {
        const seg_plane = new BSPPlane(seg.start, seg.start.x - seg.end.x, seg.start.y - seg.end.y);
        clipped_vertices = seg_plane.sutherland_hodgman(clipped_vertices);
    }
    for (const plane of bsp_nodes) {
        clipped_vertices = plane.sutherland_hodgman(clipped_vertices);
    }

    const lines: Line[] = [];
    for (let i = 0; i < clipped_vertices.length; i++) {
        const current = clipped_vertices[i];
        const prev = clipped_vertices[i === 0 ? clipped_vertices.length - 1 : i - 1];
        lines.push({ a: prev, b: current, color: "green" });
    }

    for (const seg of subsector.segs) {
        lines.push({ a: seg.start, b: seg.end, color: "red" });
    }
    return lines;
};

export function build_sectors(subsectors: Subsector[], nodes: BSPNode[]) {
    const sector_lines = new Map<number, Line[]>();

    function build_sectors_aux(node: BSPNode, planes_so_far: BSPPlane[]) {
        process_child(node.right_child_index, [...planes_so_far, node.right_plane]);
        process_child(node.left_child_index, [...planes_so_far, node.left_plane]);
    };

    function process_child(child_index: number, planes: BSPPlane[]) {
        const is_subsector = (child_index & 0x8000) === 0x8000;
        const index = child_index & 0x7FFF;
        if (is_subsector) {
            const subsector = subsectors[index];
            const subsector_lines = process_subsector(subsector, planes);
            const existing_lines = sector_lines.get(subsector.sector.index) || [];
            existing_lines.push(...subsector_lines);
            sector_lines.set(subsector.sector.index, existing_lines);
        }
        else {
            build_sectors_aux(nodes[index], planes);
        }
    }

    build_sectors_aux(nodes[nodes.length - 1], []);

    return sector_lines;
}
