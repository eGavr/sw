export type DecodedSessionRoute = {
    endpoint: string;
    webDriverSessionId: string;
};

// The client-facing session id encodes the environment endpoint so WebDriver command routing
// is stateless: any wd instance decodes the target from the id, no lookup. "." is the separator
// because it never appears in the base64url alphabet used for the endpoint.
const separator = ".";

export const SessionRoute = {
    encode(endpoint: string, webDriverSessionId: string): string {
        return `${Buffer.from(endpoint).toString("base64url")}${separator}${webDriverSessionId}`;
    },

    decode(token: string): DecodedSessionRoute | null {
        const index = token.indexOf(separator);

        if (index < 0) {
            return null;
        }

        const endpoint = Buffer.from(token.slice(0, index), "base64url").toString("utf8");
        const webDriverSessionId = token.slice(index + separator.length);

        if (!endpoint || !webDriverSessionId) {
            return null;
        }

        return { endpoint, webDriverSessionId };
    },
};
