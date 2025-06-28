const fs = require('fs/promises')
const path = require('path')

const PLUGIN_NAME = 'markmap'
const DIST_PATH = './dist'
const RELEASE_PATH = './release'

async function pack() {
  const releaseDir = path.join(RELEASE_PATH, PLUGIN_NAME)

  try {
    // Clean up previous release
    await fs.rm(RELEASE_PATH, { recursive: true, force: true })

    // Create release directory
    await fs.mkdir(releaseDir, { recursive: true })

    // Copy dist contents to release directory
    await fs.cp(DIST_PATH, releaseDir, { recursive: true })

    // Copy manifest.json
    await fs.cp(
      path.join('./src', 'manifest.json'),
      path.join(releaseDir, 'manifest.json')
    )

    console.log(`Plugin packed into: ${releaseDir}`)

  } catch (error) {
    console.error('Error during packaging:', error)
    process.exit(1)
  }
}

pack() 