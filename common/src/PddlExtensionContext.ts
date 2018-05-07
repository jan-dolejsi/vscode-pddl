/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

/**
 * An extension context is a collection of utilities private to an
 * extension.
 */
export interface PddlExtensionContext {

	/**
	 * The absolute file path of the directory containing the extension.
	 */
	extensionPath: string;

	/**
	 * Get the absolute path of a resource contained in the extension.
	 *
	 * @param relativePath A relative path to a resource contained in the extension.
	 * @return The absolute path of the resource.
	 */
	asAbsolutePath(relativePath: string): string;

	/**
	 * An absolute file path of a workspace specific directory in which the extension
	 * can store private state. The directory might not exist on disk and creation is
	 * up to the extension. However, the parent directory is guaranteed to be existent.
	 */
	storagePath: string | undefined;
}
