/**
 * Base class for all Inference Providers.
 */
export class Provider {
  /**
   * Run inference on the project directory.
   * @param {string} projectDir 
   * @param {Object} facts The current facts object to mutate/append to.
   */
  async infer(projectDir, facts) {
    throw new Error('infer() must be implemented by subclasses');
  }
}
