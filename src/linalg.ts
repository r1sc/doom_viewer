export class Vec3 {
    constructor(public x: number, public y: number, public z: number) {}

    public length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    public dot(b: Vec3): number {
        return this.x * b.x + this.y * b.y + this.z * b.z;
    }

    public normalized(): Vec3 {
        const l = this.length();
        return new Vec3(this.x / l, this.y / l, this.z / l);
    }

    public cross(b: Vec3): Vec3 {
        const x = this.y * b.z - this.z * b.y;
        const y = this.z * b.x - this.x * b.z;
        const z = this.x * b.y - this.y * b.x;
        return new Vec3(x, y, z);
    }

    public add(b: Vec3): Vec3 {
        return new Vec3(this.x + b.x, this.y + b.y, this.z + b.z);
    }

    public sub(b: Vec3): Vec3 {
        return new Vec3(this.x - b.x, this.y - b.y, this.z - b.z);
    }

    public mul(b: number): Vec3 {
        return new Vec3(this.x * b, this.y * b, this.z * b);
    }
}

export class Plane {
    // Ax + By + Cz + D = 0
    constructor(public normal: Vec3, public d: number) {}

    public static fromThreePoints(a: Vec3, b: Vec3, c: Vec3) {
        const ab = b.sub(a);
        const ac = c.sub(a);
        const normal = ac.cross(ab).normalized();
        const d = -normal.dot(a);
        return new Plane(normal, d);
    }

    public distance_to(v: Vec3): number {
        return this.normal.dot(v) + this.d;
    }

    public project(v: Vec3): Vec3 {
        const dist = this.distance_to(v);
        return v.add(this.normal.mul(-dist));
    }

    public raycast(origin: Vec3, direction: Vec3): number | null {
        const denom = this.normal.dot(direction);
        if (denom >= 0) return null;

        const t = -this.distance_to(origin) / denom;
        if (t < 0) return null; // Target is behind the ray

        return t;
    }
}

export class Quaternion {
    constructor(public w = 1, public x = 0, public y = 0, public z = 0) {}

    public static from_angle_axis(angle_rad: number, axis: Vec3) {
        const half_angle = angle_rad / 2;
        const half_angle_sin = Math.sin(half_angle);
        return new Quaternion(Math.cos(half_angle), half_angle_sin * axis.x, half_angle_sin * axis.y, half_angle_sin * axis.z);
    }

    public static from_euler_angles(roll: number, pitch: number, yaw: number) {
        const cu = Math.cos(roll / 2);
        const cv = Math.cos(pitch / 2);
        const cw = Math.cos(yaw / 2);

        const su = Math.sin(roll / 2);
        const sv = Math.sin(pitch / 2);
        const sw = Math.sin(yaw / 2);

        const q0 = cu * cv * cw + su * sv * sw;
        const q1 = su * cv * cw - cu * sv * sw;
        const q2 = cu * sv * cw + su * cv * sw;
        const q3 = cu * cv * sw - su * sv * cw;

        return new Quaternion(q0, q1, q2, q3);
    }

    public to_axis_angle() {
        const rotation_angle = 2 * Math.acos(this.w);
        if (rotation_angle === 0) {
            return new Quaternion();
        } else {
            const half_angle_sin = Math.sin(rotation_angle / 2);
            return new Quaternion(this.x / half_angle_sin, this.y / half_angle_sin, this.z / half_angle_sin, rotation_angle);
        }
    }

    public inverse() {
        return new Quaternion(this.w, -this.x, -this.y, -this.z);
    }

    public mul(s: Quaternion) {
        const r0 = this.w;
        const r1 = this.x;
        const r2 = this.y;
        const r3 = this.z;

        const s0 = s.w;
        const s1 = s.x;
        const s2 = s.y;
        const s3 = s.z;

        const t0 = r0 * s0 - r1 * s1 - r2 * s2 - r3 * s3;
        const t1 = r0 * s1 + r1 * s0 - r2 * s3 + r3 * s2;
        const t2 = r0 * s2 + r1 * s3 + r2 * s0 - r3 * s1;
        const t3 = r0 * s3 - r1 * s2 + r2 * s1 + r3 * s0;

        return new Quaternion(t0, t1, t2, t3);
    }

    public rotate(v: Vec3): Vec3 {
        const p = new Quaternion(0, v.x, v.y, v.z);
        const inv = this.inverse();
        const res = inv.mul(p.mul(this));

        return new Vec3(res.x, res.y, res.z);
    }

    public get_matrix() {
        const q0 = this.w;
        const q1 = this.x;
        const q2 = this.y;
        const q3 = this.z;

        const q12 = 2 * this.x * this.x;
        const q22 = 2 * this.y * this.y;
        const q32 = 2 * this.z * this.z;

        const q0q1 = 2 * q0 * q1;
        const q0q2 = 2 * q0 * q2;
        const q0q3 = 2 * q0 * q3;
        const q1q2 = 2 * q1 * q2;
        const q1q3 = 2 * q1 * q3;
        const q2q3 = 2 * q2 * q3;

        // prettier-ignore
        return new DOMMatrix([
            1 - q22 - q32, q1q2 - q0q3, q1q3 + q0q2, 0,
            q1q2 + q0q3, 1 - q12 - q32, q2q3 - q0q1, 0,
            q1q3 - q0q2, q2q3 + q0q1, 1 - q12 - q22, 0,
            0, 0, 0, 1
        ]);
    }
}
