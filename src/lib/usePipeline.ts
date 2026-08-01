import * as React from "react";
import { selectPipeline, type Pipeline } from "./convert";
import { resolutionToSize, type ResKey } from "./format";

/**
 * Which pipeline this device will use, or null until the probe resolves.
 *
 * It is async because the question is whether the H.264 *encoder* accepts the
 * config, not merely whether `VideoEncoder` exists, and that is a promise.
 *
 * Four places need the answer and all have to agree: the dropzone's time
 * estimate, the offline pill, the footer's "powered by", and the command
 * disclosure's explanation of what this site actually does. Each was growing
 * its own copy of the same effect. The underlying `selectPipeline` is memoized
 * per size, so extra callers cost nothing.
 *
 * Callers render neutral copy while it is null rather than guessing, since a
 * wrong guess would flash the other pipeline's wording for a frame.
 */
export function usePipeline(resolution: ResKey = "1080p"): Pipeline | null {
  const [pipeline, setPipeline] = React.useState<Pipeline | null>(null);
  const size = resolutionToSize(resolution);

  React.useEffect(() => {
    let live = true;
    void selectPipeline(size).then((p) => {
      if (live) setPipeline(p);
    });
    return () => {
      live = false;
    };
  }, [size]);

  return pipeline;
}
