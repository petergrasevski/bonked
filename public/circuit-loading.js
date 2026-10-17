// Give the browser an opportunity to paint and process lobby controls between build stages.
export const yieldToLobby = () => new Promise((resolve) => setTimeout(resolve, 20));
export class CircuitLoader {
  constructor({ initialId, build, onReady, onChange = () => {} }) {
    Object.assign(this, { readyId: initialId, targetId: initialId, build, onReady, onChange });
    this.loading = false;
    this.error = null;
    this.stage = '';
    this.generation = 0;
  }
  request(id, { retry = false } = {}) {
    if (id === this.targetId && !retry) return;
    this.targetId = id;
    this.generation++;
    this.error = null;
    if (!this.loading) this.running = this.run();
  }
  async run() {
    this.loading = true;
    while (this.loading) {
      const id = this.targetId,
        generation = this.generation,
        current = () => generation === this.generation;
      this.stage = 'Preparing circuit';
      this.onChange();
      try {
        const result = await this.build(id, {
          current,
          progress: (stage) => {
            if (current()) {
              this.stage = stage;
              this.onChange();
            }
          },
        });
        if (!current()) {
          result?.dispose();
          continue;
        }
        this.readyId = id;
        this.loading = false;
        this.error = null;
        this.onReady(result);
      } catch (error) {
        if (!current()) continue;
        this.loading = false;
        this.error = error;
        this.readyId = null;
      }
      this.onChange();
    }
  }
}
