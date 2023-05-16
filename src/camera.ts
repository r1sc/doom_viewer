import { Quaternion, Vec3 } from "./linalg";
import { Transform } from "./transform";

function glFrustum(left: number, right: number, bottom: number, top: number, znear: number, zfar: number) {
    const temp = 2.0 * znear;
    const temp2 = right - left;
    const temp3 = top - bottom;
    const temp4 = zfar - znear;
    return new DOMMatrix([
        temp / temp2,
        0.0,
        0.0,
        0.0,
        0.0,
        temp / temp3,
        0.0,
        0.0,
        (right + left) / temp2,
        (top + bottom) / temp3,
        (-zfar - znear) / temp4,
        -1.0,
        0.0,
        0.0,
        (-temp * zfar) / temp4,
        0.0,
    ]);
}

function gluPerspective(fov_y_degrees: number, aspect: number, znear: number, zfar: number) {
    const ymax = znear * Math.tan((fov_y_degrees * Math.PI) / 360.0);
    const xmax = ymax * aspect;
    return glFrustum(xmax, -xmax, -ymax, ymax, znear, zfar);
}

export class Camera {
    public projection: DOMMatrix;

    public transform = new Transform(true);

    constructor(fov_degrees: number, aspect: number, near: number, far: number) {
        this.projection = gluPerspective(fov_degrees, aspect, near, far);
    }

    public get_view_projection_matrix() {
        return this.projection.multiply(this.transform.get_matrix());
    }
}
