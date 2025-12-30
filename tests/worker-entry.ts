// Worker entry point for vitest-pool-workers
export default {
  async fetch(): Promise<Response> {
    return new Response('SIP Test Worker');
  },
};
