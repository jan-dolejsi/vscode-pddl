/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ExtensionContext, window, MessageItem } from 'vscode';
import { Val } from './Val';

const NEVER_DOWNLOAD_VAL = 'neverDownloadVal';

export class ValDownloadReminder {
    private downloadValLater = false;

    constructor(private context: ExtensionContext, private val: Val) {
    }

    async suggestValDownloadConfigurationIfAbsent(): Promise<void> {
        let isInstalled: boolean = await this.val.isInstalled();
        if (!isInstalled) {
            this.suggestValDownloadConfiguration(true);
        }
    }

    async suggestValDownloadConfiguration(showNever: boolean): Promise<void> {
        if (this.downloadValLater || this.context.globalState.get(NEVER_DOWNLOAD_VAL)) { return; }

        let downloadValNow: MessageItem = { title: "Download now..." };
        let downloadValNever: MessageItem = { title: "Never" };
        let downloadValLater: MessageItem = { title: "Later", isCloseAffordance: true };
        let options: MessageItem[] = [downloadValNow, downloadValLater];
        if (showNever) { options.splice(2, 0, downloadValNever); }
        let message = "To enable all features, get PDDL parser and plan validator and evaluator. Download the [build](https://dev.azure.com/schlumberger/ai-planning-validation) of [VAL tools](https://github.com/KCL-Planning/VAL).";
        let choice = await window.showInformationMessage(message, ...options);

        switch (choice) {
            case downloadValNow:
                this.launchDownload();
                // if the above method call updates the configuration, the parser will be notified
                break;

            case downloadValLater:
                this.downloadValLater = true;// will retry in the next session
                break;

            case downloadValNever:
                this.context.globalState.update(NEVER_DOWNLOAD_VAL, true);
                break;

            default:
                break;
        }
    }

    async launchDownload(): Promise<void> {
        try {
            await this.val.downloadConfigureAndCleanUp();
        } catch (ex) {
            window.showErrorMessage(ex.message ?? ex);
        }
    }
}