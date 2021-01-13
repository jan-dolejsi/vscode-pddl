/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2021. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { ValStep, ValStepError } from 'ai-planning-val';
import { env, Uri, window } from 'vscode';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleValStepError(err: any, valStepPath: string): Promise<void> {
        if (err instanceof ValStepError) {
            try {
                const exportCase = "Export valstep case...";
                const choice = await window.showErrorMessage("ValStep failed to evaluate the plan values.", exportCase, "Ignore");
                if (choice === exportCase) {
                    const targetPathUris = await window.showOpenDialog({
                        canSelectFolders: true, canSelectFiles: false,
                        defaultUri: Uri.file(path.dirname(err.domain.fileUri.fsPath)),
                        openLabel: 'Select target folder'
                    });
                    if (!targetPathUris) { return; }
                    const targetPath = targetPathUris[0];
                    const outputPath = await ValStep.storeError(err, targetPath.fsPath, valStepPath);
                    const success = await env.openExternal(Uri.file(outputPath));
                    if (!success) {
                        window.showErrorMessage(`Files for valstep bug report: ${outputPath}.`);
                    }
                }
            }
            catch (err1) {
                console.log(err1);
            }
        }
        else {
            window.showWarningMessage(err?.message ?? err);
        }
    }
