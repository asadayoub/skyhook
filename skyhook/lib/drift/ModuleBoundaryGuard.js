/**
 * ModuleBoundaryGuard - Domain-Driven Design (DDD) & Module Boundary Governance
 * Validates dependency graphs against architectural layer contracts, module encapsulation,
 * and detects circular dependencies using Tarjan's Strongly Connected Components algorithm.
 */

import fs from 'fs';
import path from 'path';
import { readYaml } from '../utils.js';

export class ModuleBoundaryGuard {
  constructor(projectDir = process.cwd(), customConfig = null) {
    this.projectDir = path.resolve(projectDir);
    this.customConfig = customConfig;
  }

  /**
   * Load boundaries configuration from .skyhook/architecture-boundaries.yaml or auto-detect
   * @param {Object} [ctx]
   * @returns {Object}
   */
  loadConfiguration(ctx = null) {
    if (this.customConfig) {
      return this.normalizeConfig(this.customConfig);
    }

    const skyhookDir = (ctx && ctx.skyhookDir) || path.join(this.projectDir, '.skyhook');
    const boundariesFile = path.join(skyhookDir, 'architecture-boundaries.yaml');

    if (fs.existsSync(boundariesFile)) {
      const config = readYaml(boundariesFile);
      if (config && (config.layers || config.modules)) {
        return this.normalizeConfig(config);
      }
    }

    // Auto-detect standard conventions if file not present
    return this.autoDetectConventions();
  }

  /**
   * Auto-detect baseline DDD layer conventions from directory presence
   */
  autoDetectConventions() {
    const layers = [];
    const checkDir = (dirs) => dirs.some(d => fs.existsSync(path.join(this.projectDir, d)));

    // 1. Domain
    if (checkDir(['domain', 'src/domain', 'lib/domain', 'core/domain'])) {
      layers.push({
        name: 'domain',
        pattern: '(?:^|/)(?:src/|lib/|core/)?domain/',
        allowedDependencies: []
      });
    }

    // 2. Application / Services
    if (checkDir(['application', 'src/application', 'services', 'src/services'])) {
      layers.push({
        name: 'application',
        pattern: '(?:^|/)(?:src/|lib/)?(?:application|services)/',
        allowedDependencies: ['domain']
      });
    }

    // 3. Infrastructure / DB / Repositories
    if (checkDir(['infrastructure', 'src/infrastructure', 'repositories', 'src/repositories'])) {
      layers.push({
        name: 'infrastructure',
        pattern: '(?:^|/)(?:src/|lib/)?(?:infrastructure|repositories|db)/',
        allowedDependencies: ['domain', 'application']
      });
    }

    // 4. Presentation / Controllers / UI
    if (checkDir(['presentation', 'src/presentation', 'controllers', 'src/controllers', 'routes', 'src/routes'])) {
      layers.push({
        name: 'presentation',
        pattern: '(?:^|/)(?:src/|lib/)?(?:presentation|controllers|routes|views|components)/',
        allowedDependencies: ['domain', 'application'] // Cannot import infrastructure directly
      });
    }

    return {
      autoDetected: true,
      layers,
      modules: [],
      circularDependencies: { allowed: false, severity: 'error' }
    };
  }

  normalizeConfig(config) {
    return {
      autoDetected: Boolean(config.autoDetected),
      style: config.style || 'custom',
      layers: Array.isArray(config.layers) ? config.layers : [],
      modules: Array.isArray(config.modules) ? config.modules : [],
      circularDependencies: config.circularDependencies || { allowed: false, severity: 'error' }
    };
  }

  /**
   * Match a file path to its declared architectural layer
   * @param {string} relFile 
   * @param {Array<Object>} layers 
   * @returns {Object|null}
   */
  resolveLayer(relFile, layers) {
    const normalized = relFile.replace(/\\/g, '/');
    for (const layer of layers) {
      if (layer.pattern) {
        // Support regex string or glob prefix
        if (layer.pattern.startsWith('^') || layer.pattern.includes('(?:')) {
          const re = new RegExp(layer.pattern);
          if (re.test(normalized)) return layer;
        } else {
          const cleanPattern = layer.pattern.replace(/\*\*/g, '').replace(/\*/g, '');
          if (normalized.includes(cleanPattern) || normalized.startsWith(cleanPattern)) {
            return layer;
          }
        }
      }
    }
    return null;
  }

  /**
   * Validate ASTImportGraph against architectural layers, module encapsulation, and circular dependencies
   * @param {ASTImportGraph} graph 
   * @param {Object} [ctx] 
   * @returns {Object}
   */
  validate(graph, ctx = null) {
    const config = this.loadConfiguration(ctx);
    const violations = [];
    const internalEdges = graph.getAllInternalEdges();

    // 1. Layer Boundary Directionality Check
    if (config.layers.length > 0) {
      for (const edge of internalEdges) {
        const fromLayer = this.resolveLayer(edge.from, config.layers);
        const toLayer = this.resolveLayer(edge.to, config.layers);

        if (fromLayer && toLayer && fromLayer.name !== toLayer.name) {
          const allowed = fromLayer.allowedDependencies || [];
          if (!allowed.includes(toLayer.name)) {
            const isCritical = fromLayer.name === 'presentation' && toLayer.name === 'infrastructure';
            violations.push({
              type: 'LAYER_VIOLATION',
              file: edge.from,
              line: edge.line,
              fromLayer: fromLayer.name,
              toLayer: toLayer.name,
              importedFile: edge.to,
              specifier: edge.specifier,
              severity: isCritical ? 'critical' : 'error',
              message: `Layer violation: '${edge.from}' in layer '${fromLayer.name}' cannot import from layer '${toLayer.name}' (${edge.to})`,
              recommendation: `Decouple via an interface or move dependency to the '${allowed.join("' or '") || "domain"}' layer.`
            });
          }
        }
      }
    }

    // 2. Module Encapsulation Check (Private API breaches)
    if (config.modules.length > 0) {
      for (const edge of internalEdges) {
        for (const mod of config.modules) {
          const modRoot = (mod.root || '').replace(/\\/g, '/');
          const isTargetInsideMod = edge.to.startsWith(modRoot + '/');
          const isSourceInsideMod = edge.from.startsWith(modRoot + '/');

          // If source is OUTSIDE the module, but importing INSIDE the module
          if (isTargetInsideMod && !isSourceInsideMod) {
            const publicApi = mod.publicApi ? mod.publicApi.replace(/\\/g, '/') : null;
            // If target is NOT the public API file, it's a private encapsulation breach
            if (publicApi && edge.to !== publicApi) {
              violations.push({
                type: 'ENCAPSULATION_BREACH',
                file: edge.from,
                line: edge.line,
                module: mod.name,
                importedFile: edge.to,
                publicApi: mod.publicApi,
                severity: 'error',
                message: `Encapsulation breach: Cannot import internal module file '${edge.to}' directly from '${edge.from}'`,
                recommendation: `Import through the module's public interface: '${mod.publicApi}'.`
              });
            }
          }
        }
      }
    }

    // 3. Circular Dependency Detection
    let circularCycles = [];
    if (!config.circularDependencies.allowed) {
      circularCycles = graph.findCircularDependencies();
      for (const cycle of circularCycles) {
        const cycleStr = cycle.join(' ➔ ') + ' ➔ ' + cycle[0];
        violations.push({
          type: 'CIRCULAR_DEPENDENCY',
          file: cycle[0],
          line: 1,
          cycle,
          severity: 'critical',
          message: `Circular dependency cycle detected: ${cycleStr}`,
          recommendation: `Refactor dependencies or introduce an interface/event bus to break the cycle.`
        });
      }
    }

    const criticalCount = violations.filter(v => v.severity === 'critical').length;
    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length;

    return {
      passed: violations.length === 0,
      autoDetected: config.autoDetected,
      layers: config.layers,
      modules: config.modules,
      violations,
      criticalCount,
      errorCount,
      warningCount,
      circularCycles
    };
  }

  /**
   * Convenience alias for validate()
   * @param {ASTImportGraph} graph 
   * @param {Object} [ctx] 
   * @returns {Object}
   */
  checkAll(graph, ctx = null) {
    return this.validate(graph, ctx);
  }
}
