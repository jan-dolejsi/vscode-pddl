/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, ExtensionContext, MessageItem, Uri, commands, ViewColumn, workspace, ConfigurationTarget
} from 'vscode';

import { PddlConfiguration } from '../configuration/configuration';

import {diff} from 'semver';
import { OverviewPage, SHOULD_SHOW_OVERVIEW_PAGE } from './OverviewPage';
import * as fs from 'fs';
import { ValDownloader } from '../validation/ValDownloader';
import { ValDownloadReminder } from '../validation/ValDownloadReminder';
import { ExtensionInfo } from '../configuration/ExtensionInfo';
import { PlannersConfiguration } from '../configuration/PlannersConfiguration';

export class StartUp {

    overviewPage: OverviewPage;

    constructor(private context: ExtensionContext, private pddlConfiguration: PddlConfiguration, plannersConfiguration: PlannersConfiguration, private val: ValDownloader) {
        this.overviewPage = new OverviewPage(context, this.pddlConfiguration, plannersConfiguration, this.val);
    }

    atStartUp(): void {
        this.showOverviewPage();
        this.showWhatsNew();
        this.suggestFolderIsOpen();
        this.suggestAutoSave();

        new ValDownloadReminder(this.context, this.val).suggestValDownloadConfigurationIfAbsent();
    }

    WHATS_NEW_SHOWN_FOR_VERSION = 'whatsNewShownForVersion';
    NEVER_AUTO_SAVE = 'neverAutoSave';

    suggestFolderIsOpen(): void {
        // The PDDL extension works best if you open VS Code in a specific folder. Use File > Open Folder ...
    }

    async suggestAutoSave(): Promise<void> {
        if (this.context.globalState.get(this.NEVER_AUTO_SAVE, false)) { return; }

        const option = "files.autoSave";
        if (workspace.getConfiguration().get(option) === "off") {
            const changeConfigurationOption: MessageItem = { title: "Configure auto-save"};
            const notNow: MessageItem = { title: "Not now" };
            const never: MessageItem = { title: "Do not ask again" };
            const options = [changeConfigurationOption, notNow, never];

            const choice = await window.showInformationMessage("Switching on `File > Auto Save` saves you from constant file saving when working with command-line tools.", ...options);

            switch(choice){
                case changeConfigurationOption:
                    workspace.getConfiguration().update(option, "afterDelay", ConfigurationTarget.Global);
                    break;
                case never:
                    this.context.globalState.update(this.NEVER_AUTO_SAVE, true);
                case notNow:
                default:
                    // do nothing
                    break;
            }
        }
    }

    async showWhatsNew(): Promise<void> {
        const currentVersion = new ExtensionInfo(ExtensionInfo.EXTENSION_ID).getVersion();
        const lastValue = this.context.globalState.get(this.WHATS_NEW_SHOWN_FOR_VERSION, "0.0.0");

        const lastInstalledDiff = diff(currentVersion, lastValue);
        if (lastInstalledDiff === null) {
             // same version
            return;
        }
        if (['major', 'minor'].includes(lastInstalledDiff)) {

            if (true) {
                this.showChangeLog();
            }
            else {
                const changeLog = this.context.asAbsolutePath('CHANGELOG.html');
                const html = (await fs.promises.readFile(changeLog, { encoding: "utf-8" })).toString();

                const webViewPanel = window.createWebviewPanel(
                    "pddl.WhatsNew",
                    "PDDL: What's new?",
                    ViewColumn.Active,
                    {
                        retainContextWhenHidden: true,
                        enableFindWidget: true,
                        enableCommandUris: false,
                        enableScripts: true
                    }
                );

                webViewPanel.webview.html = html;

                this.context.subscriptions.push(webViewPanel);
            }
            this.context.globalState.update(this.WHATS_NEW_SHOWN_FOR_VERSION, currentVersion);
        } else {
            const SEE = `See what is new`;
            const LATER = "Later";
            const answer = await window.showInformationMessage(`PDDL Extension was updated to ${currentVersion}.`, SEE, LATER);
            switch (answer) {
                case LATER:
                    // do nothing
                    break;
                case SEE:
                    this.showChangeLog();
                    // intentionally falling through to 'default'
                default:
                    this.context.globalState.update(this.WHATS_NEW_SHOWN_FOR_VERSION, currentVersion);
            }
        }
    }

    private showChangeLog(): void {
        const changeLogMd = this.context.asAbsolutePath('CHANGELOG.md');
        commands.executeCommand('markdown.showPreview', Uri.file(changeLogMd), null, {
            sideBySide: false,
            locked: true
        });
    }

    showOverviewPage(): void {
        const shouldShow = this.context.globalState.get<boolean>(SHOULD_SHOW_OVERVIEW_PAGE, true);
        if (shouldShow) {
            this.overviewPage.showWelcomePage(false);
        }
    }
}
