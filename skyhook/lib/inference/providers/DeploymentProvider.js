import fs from 'fs';
import path from 'path';
import { Provider } from '../Provider.js';

export class DeploymentProvider extends Provider {
  async infer(projectDir, facts) {
    const deployConfigs = [
      { file: 'vercel.json', platform: 'Vercel', confidence: 0.95 },
      { file: 'netlify.toml', platform: 'Netlify', confidence: 0.9 },
      { file: 'Dockerfile', platform: 'Docker', confidence: 0.8 },
      { file: 'docker-compose.yml', platform: 'Docker Compose', confidence: 0.8 },
      { file: 'fly.toml', platform: 'Fly.io', confidence: 0.9 },
      { file: 'railway.toml', platform: 'Railway', confidence: 0.9 },
      { file: 'render.yaml', platform: 'Render', confidence: 0.9 },
      { file: 'wrangler.toml', platform: 'Cloudflare Workers', confidence: 0.9 },
      { file: '.vercel', platform: 'Vercel', confidence: 0.7 },
      { file: '.netlify', platform: 'Netlify', confidence: 0.7 }
    ];

    for (const { file, platform, confidence } of deployConfigs) {
      const fullPath = path.join(projectDir, file);
      if (fs.existsSync(fullPath)) {
        if (!facts.deployment || confidence > (facts.confidence.deployment || 0)) {
          facts.deployment = platform;
          facts.confidence.deployment = confidence;
        }
      }
    }

    // Check for Kubernetes
    const k8sDir = path.join(projectDir, 'k8s');
    if (fs.existsSync(k8sDir)) {
      facts.deployment = 'Kubernetes';
      facts.confidence.deployment = 0.85;
    }

    // CI/CD configs
    const ciPaths = {
      'github': path.join(projectDir, '.github', 'workflows'),
      'gitlab': path.join(projectDir, '.gitlab-ci.yml'),
      'circleci': path.join(projectDir, '.circleci', 'config.yml'),
      'jenkins': path.join(projectDir, 'Jenkinsfile'),
      'azure': path.join(projectDir, 'azure-pipelines.yml')
    };

    for (const [ci, p] of Object.entries(ciPaths)) {
      if (fs.existsSync(p)) {
        facts.ci = ci;
        facts.confidence.ci = 0.9;
        break;
      }
    }
  }
}
