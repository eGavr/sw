import { Application, ApplicationData } from "../environment/application/application";
import { EnvironmentId } from "../environment/environment-id";

import { SessionId } from "./session-id";
import { SessionIdleTimeout } from "./session-idle-timeout";

export type SessionData = {
    id: string;
    environmentId: string;
    application: ApplicationData;
    idleTimeoutMs: number;
    createdAt: Date;
    lastActivityAt: Date;
    endpoint?: string | null;
    webDriverSessionId?: string | null;
};

export type SessionCreateParams = {
    environmentId: EnvironmentId;
    application: Application;
    idleTimeout: SessionIdleTimeout;
    now: Date;
};

type SessionConstructorParams = {
    id?: SessionId;
    environmentId: EnvironmentId;
    application: Application;
    idleTimeout: SessionIdleTimeout;
    createdAt: Date;
    lastActivityAt: Date;
    endpoint?: string | null;
    webDriverSessionId?: string | null;
};

export class Session {
    static create(params: SessionCreateParams): Session {
        return new Session({
            environmentId: params.environmentId,
            application: params.application,
            idleTimeout: params.idleTimeout,
            createdAt: params.now,
            lastActivityAt: params.now,
        });
    }

    static fromObject(data: SessionData): Session {
        return new Session({
            id: SessionId.fromString(data.id),
            environmentId: EnvironmentId.fromString(data.environmentId),
            application: Application.fromObject(data.application),
            idleTimeout: SessionIdleTimeout.fromMilliseconds(data.idleTimeoutMs),
            createdAt: data.createdAt,
            lastActivityAt: data.lastActivityAt,
            endpoint: data.endpoint ?? null,
            webDriverSessionId: data.webDriverSessionId ?? null,
        });
    }

    readonly application: Application;
    readonly idleTimeout: SessionIdleTimeout;
    readonly createdAt: Date;

    private readonly _id: SessionId;
    private readonly _environmentId: EnvironmentId;
    private _lastActivityAt: Date;
    private readonly _endpoint: string | null;
    private _webDriverSessionId: string | null;

    private constructor(params: SessionConstructorParams) {
        this._id = params.id ?? SessionId.create();
        this._environmentId = params.environmentId;
        this.application = params.application;
        this.idleTimeout = params.idleTimeout;
        this.createdAt = params.createdAt;
        this._lastActivityAt = params.lastActivityAt;
        this._endpoint = params.endpoint ?? null;
        this._webDriverSessionId = params.webDriverSessionId ?? null;
    }

    get id(): string {
        return this._id.getValue();
    }

    get environmentId(): EnvironmentId {
        return this._environmentId;
    }

    get lastActivityAt(): Date {
        return this._lastActivityAt;
    }

    get endpoint(): string | null {
        return this._endpoint;
    }

    get webDriverSessionId(): string | null {
        return this._webDriverSessionId;
    }

    touch(now: Date): void {
        if (now > this._lastActivityAt) {
            this._lastActivityAt = now;
        }
    }

    isIdleAt(now: Date): boolean {
        return now.getTime() - this._lastActivityAt.getTime() > this.idleTimeout.milliseconds;
    }

    bindWebDriverSession(webDriverSessionId: string): void {
        this._webDriverSessionId = webDriverSessionId;
    }

    toObject(): SessionData {
        return {
            id: this.id,
            environmentId: this._environmentId.getValue(),
            application: this.application.toObject(),
            idleTimeoutMs: this.idleTimeout.milliseconds,
            createdAt: this.createdAt,
            lastActivityAt: this._lastActivityAt,
            endpoint: this._endpoint,
            webDriverSessionId: this._webDriverSessionId,
        };
    }
}
