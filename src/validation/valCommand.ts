/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

export const VAL_DOWNLOAD_COMMAND = "pddl.downloadVal";

/** Val download command options. */
export interface ValDownloadOptions {
    /** User already made an informed decision. */
    bypassConsent: ValDownloadOptions;
}