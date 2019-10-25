/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

/**
 * Simple directional graph.
 */
export class DirectionalGraph {
    // vertices and edges stemming from them
    verticesAndEdges: [string, string[]][] = [];
    constructor() {
    }
    /**
     * Get all vertices.
     */
    getVertices(): string[] {
        return this.verticesAndEdges.map(tuple => tuple[0]);
    }
    /**
     * Get all edges.
     */
    getEdges(): [string, string][] {
        let edges: [string, string][] = [];
        this.verticesAndEdges.forEach(vertexEdges => {
            let fromVertex = vertexEdges[0];
            let connectedVertices = vertexEdges[1];
            connectedVertices.forEach(toVertex => edges.push([fromVertex, toVertex]));
        });
        return edges;
    }
    addEdge(from: string, to: string): DirectionalGraph {
        let fromVertex = this.verticesAndEdges.find(vertex => vertex[0] === from);
        if (fromVertex) {
            let edgesAlreadyInserted = fromVertex[1];
            if (to && !edgesAlreadyInserted.includes(to)) {
                edgesAlreadyInserted.push(to);
            }
        }
        else {
            let edges = to ? [to] : [];
            this.verticesAndEdges.push([from, edges]);
        }
        if (to) {
            this.addEdge(to, null);
        }
        return this;
    }
    getVerticesWithEdgesFrom(vertex: string): string[] {
        return this.verticesAndEdges.find(t => t[0] === vertex)[1];
    }
    getVerticesWithEdgesTo(vertex: string): string[] {
        return this.verticesAndEdges
            .filter(t => t[1].includes(vertex))
            .map(t => t[0]);
    }
    getSubtreePointingTo(vertex: string): string[] {
        let vertices = this.getVerticesWithEdgesTo(vertex);
        let verticesSubTree = vertices
            .map(childVertex => this.getSubtreePointingTo(childVertex))
            .reduce((x, y) => x.concat(y), []);
        return vertices.concat(verticesSubTree);
    }
    getSubtreePointingFrom(vertex: string): string[] {
        let vertices = this.getVerticesWithEdgesFrom(vertex);
        let verticesSubTree = vertices
            .map(childVertex => this.getSubtreePointingFrom(childVertex))
            .reduce((x, y) => x.concat(y), []);
        return vertices.concat(verticesSubTree);
    }
}