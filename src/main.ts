import { BBox, BSPNode, BSPPlane, Subsector, Vertex, parse_doom_data } from "./doomdata";

(async function () {
    const { nodes, subsectors, sectors } = await parse_doom_data(
        "https://raw.githubusercontent.com/mattiasgustavsson/doom-crt/main/DOOM1.WAD",
        "E1M1"
    );
    //   X  Y  Z     R  G  B
    

    type Line = { a: Vertex, b: Vertex, color: string };

    const process_subsector = (subsector: Subsector, bsp_nodes: BSPPlane[]) => {
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
            // lines.push({ a: seg.start, b: seg.end, color: "red" });
        }
        return lines;
    };


    let sector_vertices = new Map<number, Line[]>();

    const build_sectors = (node: BSPNode, planes_so_far: BSPPlane[]) => {
        const right_planes = [...planes_so_far, node.right_plane];
        const left_planes = [...planes_so_far, node.left_plane];

        const right_is_subsector = (node.right_child_index & 0x8000) === 0x8000;
        const right_index = node.right_child_index & 0x7FFF;
        if (right_is_subsector) {
            const v = process_subsector(subsectors[right_index], right_planes);
            const lines = sector_vertices.get(subsectors[right_index].sector.index) || [];
            lines.push(...v);
            sector_vertices.set(subsectors[right_index].sector.index, lines);
        }
        else {
            build_sectors(nodes[right_index], right_planes);
        }

        const left_is_subsector = (node.left_child_index & 0x8000) === 0x8000;
        const left_index = node.left_child_index & 0x7FFF;
        if (left_is_subsector) {
            const v = process_subsector(subsectors[left_index], left_planes);
            const lines = sector_vertices.get(subsectors[left_index].sector.index) || [];
            lines.push(...v);
            sector_vertices.set(subsectors[left_index].sector.index, lines);
        }
        else {
            build_sectors(nodes[left_index], left_planes);
        }
    };

    build_sectors(nodes[nodes.length - 1], []);

    const canvas = document.createElement("canvas");
    canvas.width = document.body.clientWidth;
    canvas.height = document.body.clientHeight;
    document.body.append(canvas);
    const ctx = canvas.getContext("2d")!;
    
    const list = document.createElement("select");
    list.multiple = true;
    list.size = 20;
    list.style.position = "absolute";
    list.style.top = "0";
    list.style.left = "0";
    document.body.append(list);

    sectors.forEach(s => {
        const o = document.createElement("option");
        o.text = s.index.toString();
        o.value = s.index.toString();
        list.append(o);
    });

    let x = 1000;
    let y = -1000;
    let scale = 0.5;
    document.onkeydown = e => {
        if(e.key === "ArrowUp") {
            y-=100;
        }
        if(e.key === "ArrowDown") {
            y+=100;
        }
        if(e.key === "ArrowLeft") {
            x-=100;
        }
        if(e.key === "ArrowRight") {
            x+=100;
        }
        if(e.key === "+") {
            scale+=0.1;
        }
        if(e.key === "-") {
            scale-=0.1;
        }
    }

    const root = nodes[nodes.length - 1];
    const min_x = Math.min(root.left_bbox.min.x, root.right_bbox.min.x);
    const min_y = Math.min(root.left_bbox.min.y, root.right_bbox.min.y);
    const max_x = Math.min(root.left_bbox.max.x, root.right_bbox.max.x);
    const max_y = Math.min(root.left_bbox.max.y, root.right_bbox.max.y);

    const center_x = (max_x - min_x) / 2 + min_x;
    const center_y = (max_y - min_y) / 2 + min_y;
    const colors = ["red", "green", "blue", "orange", "purple", "gray"];

    (function render() {
        ctx.resetTransform();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.translate(-x, -y);
        ctx.scale(scale, scale);

        let i = 0;
        for (const so of list.selectedOptions) {
            const sector_index = parseInt(so.value);
            const lines = sector_vertices.get(sector_index)!;
            const color = colors[(i++) % colors.length];
            ctx.strokeStyle = color;
            for (const l of lines) {
                ctx.beginPath();                
                ctx.moveTo(l.a.x, l.a.y);
                ctx.lineTo(l.b.x, l.b.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.ellipse(l.a.x, l.a.y, 5, 5, 0, 0, 360);
                ctx.ellipse(l.b.x, l.b.y, 5, 5, 0, 0, 360);
                ctx.fill();
            }
        }
        

        requestAnimationFrame(render);
    })();
})();
