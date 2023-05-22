import { Camera } from "./camera";
import { parse_doom_data } from "./doomdata";
import { Quaternion, Vec3 } from "./linalg";
import { build_sectors } from "./sector_builder";

(async function () {
    const { nodes, subsectors, sectors, linedefs } = await parse_doom_data(
        "https://raw.githubusercontent.com/mattiasgustavsson/doom-crt/main/DOOM1.WAD",
        "E1M1"
    );
    //   X  Y  Z     R  G  B   
    const processed_sectors = build_sectors(subsectors, nodes);
    // const sector_polygons = processed_sectors.get(24)!;
    
    const randomcolor = () => [Math.random(), Math.random(), Math.random()];
    const sector_vertices: number[] = [];
    const sector_indices: number[] = [];
    let idx = 0;
    for (const [key, sector_polygons] of processed_sectors.entries()) {
        const sector = sectors[key];
        for (const polygon of sector_polygons) {

            const floor_vertices = [...polygon.vertices].reverse();
            sector_vertices.push(...floor_vertices.flatMap(v => [v.x, sector.floor, v.y, ...randomcolor()]));
            sector_indices.push(...polygon.indices.map(i => i + idx));
            idx += polygon.vertices.length;

            sector_vertices.push(...polygon.vertices.flatMap(v => [v.x, sector.ceiling, v.y, ...randomcolor()]));
            sector_indices.push(...polygon.indices.map(i => i + idx));
            idx += polygon.vertices.length;
        }
    }

    for(const linedef of linedefs) {
        const sector = linedef.front_sidedef.sector;
        if (linedef.back_sidedef !== null) {
            // Two sided
            const other_sector = linedef.back_sidedef.sector;
            if (linedef.front_sidedef.lower_texture !== "-") {

                sector_vertices.push(linedef.start.x, sector.floor, linedef.start.y, ...randomcolor());
                sector_vertices.push(linedef.start.x, other_sector.floor, linedef.start.y, ...randomcolor());
                sector_vertices.push(linedef.end.x, other_sector.floor, linedef.end.y, ...randomcolor());
                sector_vertices.push(linedef.end.x, sector.floor, linedef.end.y, ...randomcolor());
                sector_indices.push(idx + 0, idx + 1, idx + 2);
                sector_indices.push(idx + 0, idx + 2, idx + 3);
                idx += 4;
            }
            if (linedef.front_sidedef.upper_texture !== "-") {

                sector_vertices.push(linedef.start.x, other_sector.ceiling, linedef.start.y, ...randomcolor());
                sector_vertices.push(linedef.start.x, sector.ceiling, linedef.start.y, ...randomcolor());
                sector_vertices.push(linedef.end.x, sector.ceiling, linedef.end.y, ...randomcolor());
                sector_vertices.push(linedef.end.x, other_sector.ceiling, linedef.end.y, ...randomcolor());
                sector_indices.push(idx + 0, idx + 1, idx + 2);
                sector_indices.push(idx + 0, idx + 2, idx + 3);
                idx += 4;
            }

            if (linedef.back_sidedef.lower_texture !== "-") {

                sector_vertices.push(linedef.start.x, sector.floor, linedef.start.y, ...randomcolor());
                sector_vertices.push(linedef.start.x, other_sector.floor, linedef.start.y, ...randomcolor());
                sector_vertices.push(linedef.end.x, other_sector.floor, linedef.end.y, ...randomcolor());
                sector_vertices.push(linedef.end.x, sector.floor, linedef.end.y, ...randomcolor());
                sector_indices.push(idx + 0, idx + 1, idx + 2);
                sector_indices.push(idx + 0, idx + 2, idx + 3);
                idx += 4;
            }
            if (linedef.back_sidedef.upper_texture !== "-") {

                sector_vertices.push(linedef.start.x, other_sector.ceiling, linedef.start.y, ...randomcolor());
                sector_vertices.push(linedef.start.x, sector.ceiling, linedef.start.y, ...randomcolor());
                sector_vertices.push(linedef.end.x, sector.ceiling, linedef.end.y, ...randomcolor());
                sector_vertices.push(linedef.end.x, other_sector.ceiling, linedef.end.y, ...randomcolor());
                sector_indices.push(idx + 0, idx + 1, idx + 2);
                sector_indices.push(idx + 0, idx + 2, idx + 3);
                idx += 4;
            }
        } else {
            sector_vertices.push(linedef.start.x, sector.floor, linedef.start.y, ...randomcolor());
            sector_vertices.push(linedef.start.x, sector.ceiling, linedef.start.y, ...randomcolor());
            sector_vertices.push(linedef.end.x, sector.ceiling, linedef.end.y, ...randomcolor());
            sector_vertices.push(linedef.end.x, sector.floor, linedef.end.y, ...randomcolor());
            sector_indices.push(idx + 0, idx + 1, idx + 2);
            sector_indices.push(idx + 0, idx + 2, idx + 3);
            idx += 4;
        }
    }


    const list = document.createElement("select");
    list.multiple = true;
    list.size = 50;
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
