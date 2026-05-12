// @ts-nocheck
// Stub for phaser types to prevent compile errors in engine/ files
// that are kept for reference but not used by the new implementation.
declare module 'phaser' {
  const Phaser: unknown
  export default Phaser
  export namespace Phaser {
    namespace GameObjects {
      interface GameObject {}
    }
    namespace Types {
      namespace GameObjects {
        namespace Text {
          interface TextStyle {}
        }
      }
    }
    namespace Scene {
      interface Settings {}
    }
  }
  export class Scene {
    constructor(config?: unknown)
    scale: unknown
    add: unknown
    tweens: unknown
    scene: unknown
    cameras: unknown
    make: unknown
    input: unknown
    time: unknown
    events: unknown
    load: unknown
    sys: unknown
    game: unknown
    registry: unknown
    sound: unknown
    create(): void
    preload(): void
    update(): void
  }
}

declare namespace Phaser {
  namespace GameObjects {
    type Text = unknown
    type Image = unknown
    type Rectangle = unknown
    type Graphics = unknown
  }
  namespace Types {
    namespace GameObjects {
      namespace Text {
        type TextStyle = unknown
      }
    }
  }
}
