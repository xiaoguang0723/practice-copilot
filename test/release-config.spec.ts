import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageManifest {
  version: string
  build: {
    artifactName?: string
    electronDist?: string
  }
}

interface PackageLock {
  version: string
  packages: {
    '': {
      version: string
    }
  }
}

const packageManifest = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8')
) as PackageManifest
const packageLock = JSON.parse(
  readFileSync(join(process.cwd(), 'package-lock.json'), 'utf8')
) as PackageLock

describe('release configuration', () => {
  it('uses the 0.5.0 release identity consistently', () => {
    expect(packageManifest.version).toBe('0.5.0')
    expect(packageLock.version).toBe('0.5.0')
    expect(packageLock.packages[''].version).toBe('0.5.0')
  })

  it('uses the stable release artifact name and installed Electron runtime', () => {
    expect(packageManifest.build.artifactName).toBe(
      'Practice-Copilot-v${version}-${os}-${arch}.${ext}'
    )
    expect(packageManifest.build.electronDist).toBe('node_modules/electron/dist')
  })
})
