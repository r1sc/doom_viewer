import { Camera } from "./camera";
import { Quaternion, Vec3 } from "./linalg";

class BinaryReader {
    dataView: DataView;
    text_decoder = new TextDecoder("ascii");
    public offset: number = 0;

    constructor(public data: ArrayBuffer) {
        this.dataView = new DataView(data);
    }

    public readByte() {
        return this.dataView.getUint8(this.offset++);
    }

    public read_i16() {
        const result = this.dataView.getInt16(this.offset, true);
        this.offset += 2;
        return result;
    }

    public read_i32() {
        const result = this.dataView.getInt32(this.offset, true);
        this.offset += 4;
        return result;
    }

    public read_string(len: number) {
        const result = this.text_decoder.decode(new Uint8Array(this.dataView.buffer, this.offset, len));
        this.offset += len;
        return result.split("\0")[0];
    }

    public read_all<T>(reader: (br: BinaryReader, i: number) => T): T[] {
        const result: T[] = [];
        let i = 0;
        while (this.offset < this.data.byteLength) {
            result.push(reader(this, i));
            i++;
        }
        return result;
    }
}

interface Lump {
    filepos: number;
    size: number;
    name: string;
}

class WAD {
    br: BinaryReader;
    public lumps: Lump[] = [];

    constructor(data: ArrayBuffer) {
        this.br = new BinaryReader(data);
        const header = {
            wad_type: this.br.read_string(4),
            num_lumps: this.br.read_i32(),
            dir_offset: this.br.read_i32(),
        };

        this.br.offset = header.dir_offset;
        for (let i = 0; i < header.num_lumps; i++) {
            const lump: Lump = {
                filepos: this.br.read_i32(),
                size: this.br.read_i32(),
                name: this.br.read_string(8),
            };
            this.lumps.push(lump);
        }
    }

    get_data(lump_index: number) {
        const sub_ab = this.br.data.slice(this.lumps[lump_index].filepos, this.lumps[lump_index].filepos + this.lumps[lump_index].size);
        return new BinaryReader(sub_ab);
    }

    get_level_parts(name: string) {
        const marker_index = this.lumps.findIndex((l) => l.name === name);
        if (!marker_index) throw new Error("Could not find marker for level");

        return {
            THINGS: this.get_data(marker_index + 1),
            LINEDEFS: this.get_data(marker_index + 2),
            SIDEDEFS: this.get_data(marker_index + 3),
            VERTEXES: this.get_data(marker_index + 4),
            SEGS: this.get_data(marker_index + 5),
            SSECTORS: this.get_data(marker_index + 6),
            NODES: this.get_data(marker_index + 7),
            SECTORS: this.get_data(marker_index + 8),
            REJECT: this.get_data(marker_index + 9),
            BLOCKMAP: this.get_data(marker_index + 10),
        };
    }
}

interface Vertex {
    x: number;
    y: number;
}

interface Sector {
    index: number;
    floor: number;
    ceiling: number;
    floor_texture: string;
    ceiling_texture: string;
    brightness: number;
    special_type: number;
    tag: number;
    sub_sectors: Subsector[];
}

interface Sidedef {
    texture_offset_x: number;
    texture_offset_y: number;
    upper_texture: string;
    lower_texture: string;
    middle_texture: string;
    sector: Sector;
}

interface Linedef {
    start: Vertex;
    end: Vertex;
    flags: number;
    special_type: number;
    tag: number;
    front_sidedef: Sidedef;
    back_sidedef: Sidedef | null;
}

interface Seg {
    start: Vertex;
    end: Vertex;
    angle: number;
    linedef: Linedef;
    direction: number;
    offset: number;
}

interface Subsector {
    segs: Seg[];
}

interface BBox {
    min: Vertex,
    max: Vertex
}

interface Node {
    start: Vertex,
    end: Vertex,
    right_bbox: BBox,
    left_bbox: BBox,
    right_child_index: number,
    left_child_index: number
}

(async function () {
    console.log("Downloading DOOM Shareware WAD...");
    const req = await fetch("https://raw.githubusercontent.com/mattiasgustavsson/doom-crt/main/DOOM1.WAD");
    const ab = await req.arrayBuffer();

    console.log("Parsing data...");
    const wad = new WAD(ab);

    const level_stuff = wad.get_level_parts("E1M1");

    let min_x = Number.MAX_SAFE_INTEGER,
        min_y = Number.MAX_SAFE_INTEGER,
        max_x = Number.MIN_SAFE_INTEGER,
        max_y = Number.MIN_SAFE_INTEGER;

    const vertices = level_stuff.VERTEXES.read_all<Vertex>(br => {
        const vertex = {
            x: br.read_i16(),
            y: br.read_i16(),
        };
        if (vertex.x < min_x) min_x = vertex.x;
        if (vertex.y < min_y) min_y = vertex.y;
        if (vertex.x > max_x) max_x = vertex.x;
        if (vertex.y > max_y) max_y = vertex.y;
        return vertex;
    });

    const sectors = level_stuff.SECTORS.read_all<Sector>((br, i) => {
        return {
            index: i,
            floor: br.read_i16(),
            ceiling: br.read_i16(),
            floor_texture: br.read_string(8),
            ceiling_texture: br.read_string(8),
            brightness: br.read_i16(),
            special_type: br.read_i16(),
            tag: br.read_i16(),
            sub_sectors: [],
        };
    });

    const sidedefs = level_stuff.SIDEDEFS.read_all<Sidedef>(br => {
        const texture_offset_x = br.read_i16();
        const texture_offset_y = br.read_i16();
        const upper_texture = br.read_string(8);
        const lower_texture = br.read_string(8);
        const middle_texture = br.read_string(8);
        const sector_index = br.read_i16();

        return {
            texture_offset_x,
            texture_offset_y,
            upper_texture,
            lower_texture,
            middle_texture,
            sector: sectors[sector_index],
        };
    });

    const linedefs = level_stuff.LINEDEFS.read_all<Linedef>(br => {
        const start = br.read_i16();
        const end = br.read_i16();
        const flags = br.read_i16();
        const special_type = br.read_i16();
        const tag = br.read_i16();
        const front_sidedef_index = br.read_i16();
        const back_sidedef_index = br.read_i16();
        return {
            start: vertices[start],
            end: vertices[end],
            flags,
            special_type,
            tag,
            front_sidedef: sidedefs[front_sidedef_index],
            back_sidedef: back_sidedef_index === -1 ? null : sidedefs[back_sidedef_index],
        };
    });

    const segs = level_stuff.SEGS.read_all<Seg>(br => {
        const start = br.read_i16();
        const end = br.read_i16();
        const angle = br.read_i16();
        const linedef_index = br.read_i16();
        const direction = br.read_i16();
        const offset = br.read_i16();
        return {
            start: vertices[start],
            end: vertices[end],
            angle,
            linedef: linedefs[linedef_index],
            direction,
            offset,
        };
    });

    const subsectors = level_stuff.SSECTORS.read_all<Subsector>(br => {
        const ssector_segs: Seg[] = [];
        const count = br.read_i16();
        const start_index = br.read_i16();

        for (let i = 0; i < count; i++) {
            ssector_segs.push(segs[start_index + i]);
        }
        const ssector = { segs: ssector_segs };

        const back = segs[start_index].linedef.back_sidedef;
        if (back) back.sector.sub_sectors.push(ssector);

        const front = segs[start_index].linedef.front_sidedef;
        if (front) front.sector.sub_sectors.push(ssector);

        return ssector;
    });

    const nodes = level_stuff.NODES.read_all<Node>(br => {
        let x = br.read_i16();
        let y = br.read_i16();
        let dx = br.read_i16();
        let dy = br.read_i16();
        let right_bbox: BBox = {
            min: { x: br.read_i16(), y: br.read_i16() },
            max: { x: br.read_i16(), y: br.read_i16() },
        };
        let left_bbox: BBox = {
            min: { x: br.read_i16(), y: br.read_i16() },
            max: { x: br.read_i16(), y: br.read_i16() },
        };
        let right_child_index = br.read_i16();
        let left_child_index = br.read_i16();
        return {
            start: { x, y },
            end: { x: x + dx, y: y + dy },
            right_bbox,
            left_bbox,
            right_child_index,
            left_child_index
        };
    });

    console.log("Parsing done");

    //   X  Y  Z     R  G  B
    const sector_vertices: number[] = [];
    const sector_indices: number[] = [];
    let index_start = 0;

    for (const linedef of linedefs) {
        const front = linedef.front_sidedef;
        const back = linedef.back_sidedef;

        let do_middle_step = front.middle_texture !== "-";

        const floor = front.sector.floor;
        const ceiling = front.sector.ceiling;
        const other_floor = back ? Math.max(floor, back.sector.floor) : floor;
        const other_ceiling = back ? Math.min(ceiling, back.sector.ceiling) : ceiling;

        sector_vertices.push(linedef.start.x, floor, linedef.start.y, 1, 0, 0);
        sector_vertices.push(linedef.end.x, floor, linedef.end.y, 1, 0, 0);

        sector_vertices.push(linedef.start.x, other_floor, linedef.start.y, 1, 0, 0);
        sector_vertices.push(linedef.end.x, other_floor, linedef.end.y, 1, 0, 0);

        sector_vertices.push(linedef.start.x, other_ceiling, linedef.start.y, 0, 1, 0);
        sector_vertices.push(linedef.end.x, other_ceiling, linedef.end.y, 0, 1, 0);

        sector_vertices.push(linedef.start.x, ceiling, linedef.start.y, 0, 1, 1);
        sector_vertices.push(linedef.end.x, ceiling, linedef.end.y, 0, 1, 1);

        sector_indices.push(index_start + 0);
        sector_indices.push(index_start + 2);
        sector_indices.push(index_start + 3);
        sector_indices.push(index_start + 0);
        sector_indices.push(index_start + 3);
        sector_indices.push(index_start + 1);

        if (do_middle_step) {
            sector_indices.push(index_start + 2);
            sector_indices.push(index_start + 4);
            sector_indices.push(index_start + 5);
            sector_indices.push(index_start + 2);
            sector_indices.push(index_start + 5);
            sector_indices.push(index_start + 3);
        }

        sector_indices.push(index_start + 4);
        sector_indices.push(index_start + 6);
        sector_indices.push(index_start + 7);
        sector_indices.push(index_start + 4);
        sector_indices.push(index_start + 7);
        sector_indices.push(index_start + 5);

        index_start += 8;
    }


    const process_subsector = (subsector: Subsector, div_start: Vertex, div_end: Vertex, front: boolean) => {
        if (!front) return;

        let floor = subsector.segs[0].linedef.front_sidedef.sector.floor;

        sector_vertices.push(div_start.x, floor, div_start.y);
        sector_vertices.push(div_end.x, floor, div_end.y);
        let vertex_count = 2;
        for (const seg of subsector.segs) {
            sector_vertices.push(seg.start.x, floor, seg.start.y);
            sector_vertices.push(seg.end.x, floor, seg.end.y);
            vertex_count += 2;
        }

        const num_triangles = vertex_count - 3 + 1;
        for (let t = 1; t <= num_triangles; t++) {
            sector_indices.push(index_start + t);
            sector_indices.push(index_start);
            sector_indices.push(index_start + t + 1);
        }

        index_start += vertex_count;

    };

    const visit_node = (node: Node) => {
        const right_is_subsector = ((node.right_child_index >> 15) & 1) === 1;
        const right_value = node.right_child_index & 0x7FFF;
        if (right_is_subsector) {
            process_subsector(subsectors[right_value], node.start, node.end, true);
        }
        else {
            visit_node(nodes[right_value]);
        }

        const left_is_subsector = ((node.left_child_index >> 15) & 1) === 1;
        const left_value = node.left_child_index & 0x7FFF;
        if (left_is_subsector) {
            process_subsector(subsectors[left_value], node.start, node.end, false);
        }
        else {
            visit_node(nodes[left_value]);
        }
    };

    visit_node(nodes[nodes.length - 1]);

    const canvas = document.createElement("canvas");
    canvas.width = document.body.clientWidth;
    canvas.height = document.body.clientHeight;
    document.body.append(canvas);
    const gl = canvas.getContext("webgl2")!;

    function make_shader(src: string) {
        function load_shader(kind: "vertex" | "fragment", src: string) {
            const shader = gl.createShader(kind === "vertex" ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER)!;
            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(`${kind} shader compile error: ${gl.getShaderInfoLog(shader)}`);
            }
            return shader;
        }

        const program = gl.createProgram()!;
        const vs = load_shader("vertex", `#version 300 es\n#define VS\n${src}`);
        gl.attachShader(program, vs);
        const fs = load_shader("fragment", `#version 300 es\n#define FS\n${src}`);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`Shader link error: ${gl.getProgramInfoLog(program)}`);
        }
        return program;
    }

    const shader = make_shader(
        `#ifdef VS
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aColor;

uniform mat4 u_mvp;

out vec3 color;

void main() {
    gl_Position = u_mvp * vec4(aPos, 1.0);
    color = aColor;
}
#else
precision highp float;
in vec3 color;
out vec4 finalColor;
void main() {
    finalColor = vec4(color, 1.0);
}
#endif`
    );

    gl.useProgram(shader);

    const u_mvp = gl.getUniformLocation(shader, "u_mvp")!;

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const vertex_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sector_vertices), gl.STATIC_DRAW);

    const index_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index_buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(sector_indices), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 6 * 4, 0);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 6 * 4, 3 * 4);

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 1, 1);

    const camera = new Camera(45, canvas.width / canvas.height, 10, 10000);
    camera.transform.position = new Vec3(1055, 10, -3230);

    gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CW);

    const keys_down = new Set<string>();
    document.onkeydown = (e) => {
        keys_down.add(e.key.toLowerCase());
    };
    document.onkeyup = (e) => {
        keys_down.delete(e.key.toLowerCase());
    };

    let mouse_state = {
        old_x: 0,
        old_y: 0,
        current_x: 0,
        current_y: 0
    };
    const onMouseMove = (e: MouseEvent) => {
        mouse_state.current_x += e.movementX;
        mouse_state.current_y += e.movementY;
    };

    canvas.requestPointerLock = canvas.requestPointerLock || (canvas as any).mozRequestPointerLock;
    document.exitPointerLock = document.exitPointerLock || (document as any).mozExitPointerLock;

    canvas.onclick = function () {
        canvas.requestPointerLock();
    };
    document.addEventListener('pointerlockchange', lockChangeAlert, false);
    document.addEventListener('mozpointerlockchange', lockChangeAlert, false);
    function lockChangeAlert() {
        if (document.pointerLockElement === canvas || (document as any).mozPointerLockElement === canvas) {
            document.addEventListener("mousemove", onMouseMove, false);
        } else {
            document.removeEventListener("mousemove", onMouseMove, false);
        }
    }

    const DEG2RAD = Math.PI / 180;
    const UP = new Vec3(0, 1, 0);
    const RIGHT = new Vec3(1, 0, 0);
    (function render() {
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        const m_dx = mouse_state.current_x - mouse_state.old_x;
        const m_dy = mouse_state.current_y - mouse_state.old_y;
        mouse_state.old_x = mouse_state.current_x;
        mouse_state.old_y = mouse_state.current_y;

        if (m_dx !== 0 || m_dy !== 0) {
            const horiz = Quaternion.from_angle_axis(m_dx * DEG2RAD * 0.1, UP);
            const vert = Quaternion.from_angle_axis(-m_dy * DEG2RAD * 0.1, RIGHT);
            camera.transform.rotation = vert.mul(camera.transform.rotation.mul(horiz));
        }
        let speed = 5;
        if (keys_down.has("shift")) {
            speed = 20;
        }
        if (keys_down.has("w")) {
            camera.transform.position = camera.transform.position.add(camera.transform.forward.mul(speed));
        } else if (keys_down.has("s")) {
            camera.transform.position = camera.transform.position.add(camera.transform.forward.mul(-speed));
        }
        if (keys_down.has("a")) {
            camera.transform.position = camera.transform.position.add(camera.transform.right.mul(speed));
        } else if (keys_down.has("d")) {
            camera.transform.position = camera.transform.position.add(camera.transform.right.mul(-speed));
        }
        const mvp = camera.get_view_projection_matrix();

        gl.uniformMatrix4fv(u_mvp, false, mvp.toFloat32Array());
        gl.drawElements(gl.TRIANGLES, sector_indices.length, gl.UNSIGNED_SHORT, 0);

        requestAnimationFrame(render);
    })();
})();
