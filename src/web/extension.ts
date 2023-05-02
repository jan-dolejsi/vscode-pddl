/*
 * Copyright (c) Jan Dolejsi 2023. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
'use strict';

import { ExtensionContext } from 'vscode';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function activate(_context: ExtensionContext) {
	console.log('PDDL Extension loaded to VS Code web.');
}

// This method is called when your extension is deactivated
export function deactivate() {
	// Noop
}