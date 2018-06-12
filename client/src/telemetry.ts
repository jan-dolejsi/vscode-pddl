/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import TelemetryReporter from 'vscode-extension-telemetry';
import { ExtensionContext, extensions } from 'vscode';

export class Telemetry {
    reporter: any;

    constructor(context: ExtensionContext) {
        let extension = extensions.getExtension("jan-dolejsi.pddl");
        
        if(!process.env.VSCODE_APPLICATION_INSIGHTS_ID) return;
        
        // create telemetry reporter on extension activation
        this.reporter = 
            new TelemetryReporter(extension.id, <string>extension.packageJSON["version"], process.env.VSCODE_APPLICATION_INSIGHTS_ID);
        // ensure it gets property disposed
        context.subscriptions.push(this.reporter);

        // send event any time after activation
        this.reporter.sendTelemetryEvent('activated');
        // this.reporter.sendTelemetryEvent('activated', { 'stringProp': 'some string' }, { 'numericMeasure': 123}); 
    }

	dispose(): any {
        // This will ensure all pending events get flushed
        if (this.reporter) this.reporter.dispose();
	}
}