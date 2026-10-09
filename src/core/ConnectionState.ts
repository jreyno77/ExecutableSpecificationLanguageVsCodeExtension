export type ConnectionState = {
    configurationFile: string;
    status: string;
    target?: string | undefined;
    verifiedDirectory?: string | undefined;
    message: string;
};
