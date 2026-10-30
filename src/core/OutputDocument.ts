import type { DiagramPreview } from "./DiagramPreview.js";
export type OutputDocument = {
    path: string;
    mediaType: string;
    content: string;

diagram?: DiagramPreview | undefined;
};
