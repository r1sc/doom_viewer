import { Camera } from "./camera";
import { Linedef, Sidedef, Vertex, parse_doom_data } from "./doomdata";
import { Quaternion, Vec3 } from "./linalg";
import { build_sectors } from "./sector_builder";
import { pack_textures } from "./texture_packer";

(async function () {
    const level_data = await parse_doom_data(
        "https://raw.githubusercontent.com/mattiasgustavsson/doom-crt/main/DOOM1.WAD",
        "E1M3"
    );
    //   X  Y  Z     X_ofs Y_ofs W_recip H_recip u v
    const processed_sectors = build_sectors(level_data.subsectors, level_data.nodes);
    const packed_texture = pack_textures(level_data);

    function get_slab_attr(name: string) {
        const slab = packed_texture.slab_info.get(name);
        if (!slab) throw new Error("Failed to find texture " + name);
        return [slab.ofs_x, slab.ofs_y, slab.w_recip, slab.h_recip];
    }
    function slab_size(name: string) {
        const slab = packed_texture.slab_info.get(name);
        if (!slab) throw new Error("Failed to find texture " + name);
        return {w: slab.w_recip * packed_texture.atlas_size, h: slab.h_recip * packed_texture.atlas_size };
    }
    function get_u(start: Vertex, end: Vertex) {
        const dx = Math.abs(end.x - start.x);
        const dy = Math.abs(end.y - start.y);
        const l = Math.sqrt(dx * dx + dy * dy);
        return l;
    }

    const sector_vertices: number[] = [];
    const sector_indices: number[] = [];
    let idx = 0;
    for (const [key, sector_polygons] of processed_sectors.entries()) {
        const sector = level_data.sectors[key];

        const floor_attr = get_slab_attr(sector.floor_texture);
        const ceil_attr = get_slab_attr(sector.ceiling_texture);

        for (const polygon of sector_polygons) {
            const floor_vertices = [...polygon.vertices].reverse();
            sector_vertices.push(...floor_vertices.flatMap(v => [v.x, sector.floor, v.y, ...floor_attr, v.x / 64, v.y / 64]));
            sector_indices.push(...polygon.indices.map(i => i + idx));
            idx += polygon.vertices.length;

            sector_vertices.push(...polygon.vertices.flatMap(v => [v.x, sector.ceiling, v.y, ...ceil_attr, v.x / 64, v.y / 64]));
            sector_indices.push(...polygon.indices.map(i => i + idx));
            idx += polygon.vertices.length;
        }
    }

    function add_sidedef(start: Vertex, end: Vertex, u: number, low: number, high: number, texture: string, texture_offset_x: number, texture_offset_y: number) {
        const attr = get_slab_attr(texture);
        const s = slab_size(texture);
        const front_startu = texture_offset_x / s.w;
        const front_endu = u / s.w;

        const startv = texture_offset_y / s.h;
        const endv = (high -low) / s.h;

        sector_vertices.push(start.x, low, start.y, ...attr, front_startu, endv);
        sector_vertices.push(start.x, high, start.y, ...attr, front_startu, startv);
        sector_vertices.push(end.x, high, end.y, ...attr, front_endu, startv);
        sector_vertices.push(end.x, low, end.y, ...attr, front_endu, endv);
        sector_indices.push(idx + 0, idx + 1, idx + 2);
        sector_indices.push(idx + 0, idx + 2, idx + 3);
        idx += 4;
    }

    for (const linedef of level_data.linedefs) {
        const u = get_u(linedef.start, linedef.end);
        const sector = linedef.front_sidedef.sector;

        if (linedef.back_sidedef !== null) {
            // Two sided
            const other_sector = linedef.back_sidedef.sector;

            if (linedef.front_sidedef.lower_texture !== "-") {
                add_sidedef(linedef.start, linedef.end, u, sector.floor, other_sector.floor, linedef.front_sidedef.lower_texture,
                    linedef.front_sidedef.texture_offset_x, linedef.front_sidedef.texture_offset_y);
            }

            if (linedef.front_sidedef.upper_texture !== "-") {
                add_sidedef(linedef.start, linedef.end, u, other_sector.ceiling, sector.ceiling, linedef.front_sidedef.upper_texture,
                    linedef.front_sidedef.texture_offset_x, linedef.front_sidedef.texture_offset_y);
            }

            if (linedef.back_sidedef.lower_texture !== "-") {
                add_sidedef(linedef.start, linedef.end, u, sector.floor, other_sector.floor, linedef.back_sidedef.lower_texture,
                    linedef.back_sidedef.texture_offset_x, linedef.back_sidedef.texture_offset_y);
            }
            if (linedef.back_sidedef.upper_texture !== "-") {
                add_sidedef(linedef.start, linedef.end, u, other_sector.ceiling, sector.ceiling, linedef.back_sidedef.upper_texture,
                    linedef.back_sidedef.texture_offset_x, linedef.back_sidedef.texture_offset_y);
            }

            if (linedef.front_sidedef.middle_texture !== "-") {
                add_sidedef(linedef.start, linedef.end, u, sector.floor, sector.ceiling, linedef.front_sidedef.middle_texture,
                    linedef.front_sidedef.texture_offset_x, linedef.front_sidedef.texture_offset_y);
            }

            if (linedef.back_sidedef.middle_texture !== "-") {
                add_sidedef(linedef.start, linedef.end, u, other_sector.ceiling, other_sector.floor, linedef.back_sidedef.middle_texture,
                    linedef.back_sidedef.texture_offset_x, linedef.back_sidedef.texture_offset_y);
            }
        } else {
            add_sidedef(linedef.start, linedef.end, u, sector.floor, sector.ceiling, linedef.front_sidedef.middle_texture,
                linedef.front_sidedef.texture_offset_x, linedef.front_sidedef.texture_offset_y);
        }
    }

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
layout(location = 1) in vec4 aSlab; //ofs_x,ofs_y,w_recip,h_recip
layout(location = 2) in vec2 aUv; 

uniform mat4 u_mvp;

out vec2 uv;
out vec4 slab;

void main() {
    gl_Position = u_mvp * vec4(aPos, 1.0);
    slab = aSlab;
    uv = aUv;
}
#else
precision highp float;
uniform sampler2D u_texturemap;
in vec2 uv;
in vec4 slab;

out vec4 finalColor;


void main() {
    vec2 part_uv = uv * slab.zw;

    vec3 color = texture(u_texturemap, slab.xy + mod(part_uv, slab.zw)).rgb;
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
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 9 * 4, 0);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 9 * 4, 3 * 4);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 9 * 4, 7 * 4);

    const atlas_texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, atlas_texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, packed_texture.atlas_size, packed_texture.atlas_size, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(packed_texture.atlas.buffer));

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
