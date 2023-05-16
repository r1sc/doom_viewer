import { Quaternion, Vec3 } from "./linalg";

const UP = new Vec3(0, 1, 0);
const RIGHT = new Vec3(1, 0, 0);
const FORWARD = new Vec3(0, 0, -1);

export class Transform {
    public position = new Vec3(0, 0, 0);
    public rotation = Quaternion.from_euler_angles(0, 0, 0);

    constructor(private negated_transform: boolean) {}

    public get_matrix() {
        return new DOMMatrix()
            .multiplySelf(this.rotation.get_matrix())
            .translateSelf(
                this.position.x * (this.negated_transform ? -1 : 1),
                this.position.y * (this.negated_transform ? -1 : 1),
                this.position.z * (this.negated_transform ? -1 : 1)
            );
    }

    private rotate_around(axis: Vec3) {
        return this.rotation.rotate(axis);
    }

    get forward() {
        return this.rotate_around(FORWARD);
    }

    get up() {
        return this.rotate_around(UP);
    }

    get right() {
        return this.rotate_around(RIGHT);
    }
}
