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

const LATER = 'LATER';
const NEVER = 'NEVER';
const ACCEPTED = 'ACCEPTED';

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
    ACCEPTED_TO_WRITE_A_REVIEW = 'acceptedToWriteAReview';
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

    async showWhatsNew(): Promise<boolean> {
        const currentVersion = new ExtensionInfo(ExtensionInfo.EXTENSION_ID).getVersion();
        const lastValue = this.context.globalState.get(this.WHATS_NEW_SHOWN_FOR_VERSION, "0.0.0");

        const lastInstalledDiff = diff(currentVersion, lastValue);
        if (lastInstalledDiff === null) { return false; } // something odd
        if (['major', 'minor'].includes(lastInstalledDiff)) {

            if (true) {
                const changeLogMd = this.context.asAbsolutePath('CHANGELOG.md');
                commands.executeCommand('markdown.showPreview', Uri.file(changeLogMd), null, {
                    sideBySide: false,
                    locked: true
                });
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
        }

        return true;
    }

    async askForReview(): Promise<void> {
        // what was the user response last time?
        const accepted = this.context.globalState.get(this.ACCEPTED_TO_WRITE_A_REVIEW, LATER);

        if (accepted === LATER) {
            const optionAccepted: MessageItem = { title: "OK, let's give feedback" };
            const optionLater: MessageItem = { title: "Remind me later" };
            const optionNever: MessageItem = { title: "Never" };
            const options: MessageItem[] = [optionAccepted, optionLater, optionNever];

            const choice = await window.showInformationMessage('Are you finding the PDDL Extension useful? Do you want to boost our motivation? Please give us (5) stars or even write a review...', ...options);

            switch (choice) {
                case optionAccepted:
                    const reviewPage = 'https://marketplace.visualstudio.com/items?itemName=jan-dolejsi.pddl#review-details';
                    commands.executeCommand('vscode.open', Uri.parse(reviewPage));
                    this.context.globalState.update(this.ACCEPTED_TO_WRITE_A_REVIEW, ACCEPTED);
                    break;
                case optionNever:
                    this.context.globalState.update(this.ACCEPTED_TO_WRITE_A_REVIEW, NEVER);
                    break;
                case optionLater:
                default:
                    this.context.globalState.update(this.ACCEPTED_TO_WRITE_A_REVIEW, LATER);
                    break;
            }

        }
    }

    showOverviewPage(): void {
        const shouldShow = this.context.globalState.get<boolean>(SHOULD_SHOW_OVERVIEW_PAGE, true);
        if (shouldShow) {
            this.overviewPage.showWelcomePage(false);
        }
    }
}
