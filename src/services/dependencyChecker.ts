import { Command } from '@tauri-apps/plugin-shell';

export interface DependencyCheck {
  name: string;
  command: string;
  installInstructions: string;
  isInstalled: boolean;
}

export class DependencyChecker {
  private static instance: DependencyChecker;
  private dependencies: DependencyCheck[] = [
    {
      name: 'FFmpeg',
      command: 'ffmpeg -version',
      installInstructions: 'Please install FFmpeg from https://ffmpeg.org/download.html',
      isInstalled: false
    },
    {
      name: 'FFprobe',
      command: 'ffprobe -version',
      installInstructions: 'FFprobe is usually included with FFmpeg installation',
      isInstalled: false
    }
  ];

  static getInstance(): DependencyChecker {
    if (!DependencyChecker.instance) {
      DependencyChecker.instance = new DependencyChecker();
    }
    return DependencyChecker.instance;
  }

  async checkDependencies(): Promise<DependencyCheck[]> {
    const results: DependencyCheck[] = [];

    for (const dep of this.dependencies) {
      try {
        const command = Command.create(dep.command.split(' ')[0], dep.command.split(' ').slice(1));
        const result = await command.execute();
        
        results.push({
          ...dep,
          isInstalled: result.code === 0
        });
      } catch (error) {
        console.warn(`Failed to check ${dep.name}:`, error);
        results.push({
          ...dep,
          isInstalled: false
        });
      }
    }

    return results;
  }

  async checkSingleDependency(command: string): Promise<boolean> {
    try {
      const cmd = Command.create(command.split(' ')[0], command.split(' ').slice(1));
      const result = await cmd.execute();
      return result.code === 0;
    } catch (error) {
      console.warn(`Failed to check command ${command}:`, error);
      return false;
    }
  }

  getMissingDependencies(): DependencyCheck[] {
    return this.dependencies.filter(dep => !dep.isInstalled);
  }

  async installFFmpeg(): Promise<boolean> {
    try {
      // Try to install FFmpeg using system package manager
      // For now, just return false and let user install manually
      throw new Error('Please install FFmpeg manually from https://ffmpeg.org/download.html');
    } catch (error) {
      console.error('Failed to install FFmpeg:', error);
      return false;
    }
  }
}

export const dependencyChecker = DependencyChecker.getInstance();
