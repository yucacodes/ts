// Fixture: a .ts file using decorators. With `experimentalDecorators` and
// `emitDecoratorMetadata` on (the loader's defaults), the TypeScript compiler
// emits `__metadata("design:paramtypes", [Repository])`, which the downstream
// DI framework relies on. This regression guard ensures JSX support did not
// disturb decorator metadata emission.
class Repository {}

function Injectable(_target: unknown): void {}

@Injectable
class Service {
  constructor(private readonly repo: Repository) {}
}

console.log('decorators-ran')
