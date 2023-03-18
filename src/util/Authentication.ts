/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { v4 as uuidv4 } from 'uuid';
import express = require('express');
import http = require('http');
import opn = require('open');
import { planner } from 'pddl-workspace';
import { postJson } from '../httpUtils';
import { URL } from 'url';

interface TokenServiceResponse {
    stoken: string | undefined;
    accesstoken: string;
}


export class SAuthentication implements planner.Authentication {

    private sToken?: string;
    private accessToken?: string;
    private refreshToken?: string;

    constructor(private authUrl: string, private authRequestEncoded: string, private clientId: string, private callbackPort: number, private timeoutInMs: number,
        private tokensvcUrl: string, private tokensvcApiKey: string, private tokensvcAccessPath: string,
        private tokensvcValidatePath: string, private tokensvcCodePath: string, private tokensvcRefreshPath: string, private tokensvcSvctkPath: string,
        refreshToken: string, accessToken: string, sToken: string) {

        this.refreshToken = refreshToken;
        this.accessToken = accessToken;
        this.sToken = sToken;
        this.display();
    }

    getToken(): string | undefined {
        return this.sToken;
    }

    display(): void {
        console.log('URL: ' + this.authUrl);
        console.log('Request encoded: ' + this.authRequestEncoded);
        console.log('ClientId: ' + this.clientId);
        console.log('Callback port: ' + this.callbackPort);
        console.log('Timeout in ms: ' + this.timeoutInMs);
        console.log('Token Svc Url: ' + this.tokensvcUrl);
        console.log('Token Svc Api Key: ' + this.tokensvcApiKey);
        console.log('Token Svc Access Path: ' + this.tokensvcAccessPath);
        console.log('Token Svc Validate Path: ' + this.tokensvcValidatePath);
        console.log('Token Svc Code Path: ' + this.tokensvcCodePath);
        console.log('Token Svc Refresh Path: ' + this.tokensvcRefreshPath);
        console.log('Token Svc Svctk Path: ' + this.tokensvcSvctkPath);
        console.log('Refresh Token: ' + this.refreshToken);
        console.log('Access Token: ' + this.accessToken);
        console.log('S Token: ' + this.sToken);
    }

    login(onSuccess: (refreshToken: string, accessToken: string, sToken: string) => void, onError: (message: string) => void): void {
        const nonce = uuidv4();
        const app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        let server: http.Server | undefined = undefined;
        const thisAuthentication = this;
        app.post('/auth/sauth/callback', function (req, res, next) {
            server?.close();
            if (req.body.nonce === nonce) {
                thisAuthentication.refreshToken = req.body.refreshtoken;
                thisAuthentication.accessToken = req.body.accesstoken;
                thisAuthentication.sToken = req.body.stoken;
                if (thisAuthentication.refreshToken && thisAuthentication.accessToken && thisAuthentication.sToken) {
                    onSuccess(thisAuthentication.refreshToken, thisAuthentication.accessToken, thisAuthentication.sToken);
                }
                res.sendStatus(200);
                next();
            }
            else {
                onError('Unexpected nonce: ' + req.body.nonce + ' (expected:' + nonce + ')');
                res.sendStatus(401);
                next();
            }
        });
        server = http.createServer(app);
        server.on('error', function (e) {
            onError(e.message);
        });
        server.listen(this.callbackPort);
        setTimeout(() => { server?.close(); }, this.timeoutInMs);

        const authUrl = this.authUrl + '?authRequest=' + this.authRequestEncoded + '&nonce=' + nonce + '&refreshtoken&accesstoken&stoken';
        opn(authUrl);
    }

    refreshTokens(onSuccess: (refreshToken: string, accessToken: string, sToken: string) => void, onError: (message: string) => void): void {
        if (this.sToken === undefined || this.sToken === "") {
            if (this.accessToken === undefined || this.accessToken === "") {
                if (this.refreshToken === undefined || this.refreshToken === "") {
                    this.refreshToken = undefined;
                    this.accessToken = undefined;
                    this.sToken = undefined;
                    onError("Refresh Tokens failed.");
                }
                else {
                    this.accessToken = undefined;
                    this.sToken = undefined;
                    this.refreshAccessAndSToken(onSuccess, onError);
                }
            }
            else {
                this.sToken = undefined;
                this.refreshSToken(onSuccess, onError);
            }
        }
        else {
            this.validateSToken(onSuccess, onError);
        }
    }

    async refreshAccessAndSToken(onSuccess: (refreshToken: string, accessToken: string, sToken: string) => void, onError: (message: string) => void): Promise<void> {
        const url = this.tokensvcUrl + this.tokensvcRefreshPath + '?key=' + this.tokensvcApiKey + '&accesstoken=\'\'';
        const content = { clientid: this.clientId, refreshtoken: this.refreshToken };
        try {
            const response = await postJson<TokenServiceResponse>(new URL(url), content);
            this.accessToken = response.accesstoken;
            this.refreshSToken(onSuccess, onError);
        } catch (err: unknown) {
            this.accessToken = undefined;
            this.sToken = undefined;
            onError("Refresh Access Token failed: " + (err as Error).message);
        }
    }

    async refreshSToken(onSuccess: (refreshToken: string, accessToken: string, sToken: string) => void, onError: (message: string) => void): Promise<void> {
        const url = this.tokensvcUrl + this.tokensvcAccessPath + '?key=' + this.tokensvcApiKey + '&stoken=\'\'';
        const content = { clientid: this.clientId, accesstoken: this.accessToken };
        try {
            const body = await postJson<TokenServiceResponse>(new URL(url), content);
            this.sToken = body.stoken;
            if (this.refreshToken && this.accessToken && this.sToken) {
                onSuccess(this.refreshToken, this.accessToken, this.sToken);
            }
        } catch (err: unknown) {
            this.accessToken = undefined;
            this.sToken = undefined;
            onError("Refresh S Token failed: " + (err as Error).message);
        }
    }

    async validateSToken(onSuccess: (refreshToken: string, accessToken: string, sToken: string) => void, onError: (message: string) => void): Promise<void> {
        const url = this.tokensvcUrl + this.tokensvcValidatePath + '?key=' + this.tokensvcApiKey;
        const content = { clientid: this.clientId, audiences: this.clientId, stoken: this.sToken };
        try {
            await postJson(new URL(url), content);
            this.sToken = this.sToken;
            if (this.refreshToken && this.accessToken && this.sToken) {
                onSuccess(this.refreshToken, this.accessToken, this.sToken);
            }
        } catch (err) {
            this.refreshSToken(onSuccess, onError);
        }
    }
}