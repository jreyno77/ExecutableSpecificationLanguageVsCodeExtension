import type { OutputDocument } from "./OutputDocument.js";
export type OutputTab = {
    id: string;
    label: string;
    

status: string;

documents: Array<OutputDocument>;

message?: string | undefined;
};
