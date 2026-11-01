/*
  granite runner: the wasm (CPU) branch of the docling model runs in
  this dedicated worker, so the main thread stays free while the
  blocking generate pass executes - the elapsed ticker keeps counting,
  the cancel button stays responsive and the surface never reads as
  hung; the model load lives here too, so the weights come from the
  shared same-origin cache without a re-download
*/
import * as transformers from "../vendor/transformers.js";

const state = {
  "processor": null,
  "transcriber": null,
  "aborted": false
};

/*  */
class Live extends transformers.TextStreamer {
  put(value) {
    if (value.length > 1) throw Error("TextStreamer only supports batch size of 1");
    const tokens = value[0];
    if (this.next_tokens_are_prompt) {
      this.next_tokens_are_prompt = false;
      if (this.skip_prompt) return;
    }
    this.token_callback_function?.(tokens);
    this.token_cache = [...this.token_cache, ...tokens];
    /* a full cache re-decode per step keeps multibyte pieces
       intact; the printed length owns the emitted part */
    const text = this.tokenizer.decode(this.token_cache, this.decode_kwargs);
    this.on_finalized_text(text.slice(this.print_len), false);
    this.print_len = text.length;
  }
}

/*  */
const fail = function (stage, err) {
  self.postMessage({
    "type": "error",
    "stage": stage,
    "message": err && err.message ? err.message : String(err),
    "stack": err && typeof err.stack === "string" ? err.stack : ''
  });
};

/*  */
const init = async function (data) {
  const env = transformers.env;
  env.useBrowserCache = true;
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.remoteHost = data.host;
  env.remotePathTemplate = data.template;
  /*  */
  env.backends.onnx.wasm.simd = true;
  env.backends.onnx.logLevel = "error";
  /* download-path warnings (missing content-length, cache
     rejections...) are vendor noise - keep only real errors */
  env.logLevel = "error";
  /* multi-threaded wasm needs SharedArrayBuffer - the thread
     count only rises when the page is cross-origin isolated */
  env.backends.onnx.wasm.numThreads = crossOriginIsolated ? (navigator.hardwareConcurrency || 4) : 1;
  /* the vendor's wasm cache preloader turns the ORT factory path
     into a blob: URL when chrome.runtime is absent (dedicated
     workers have no extension APIs) and blob imports are CSP-
     blocked in extension contexts - keep the real same-origin
     paths so ORT uses its bundled factory instead */
  env.backends.onnx.wasm.wasmPaths = data.wasmPaths;
  env.useWasmCache = false;
  /* the vendor sets a high-performance power preference; chrome
     ignores it on windows and warns - skip the option entirely */
  if (env.backends.onnx.webgpu) env.backends.onnx.webgpu.powerPreference = undefined;
  /*  */
  try {
    state.processor = await transformers.AutoProcessor.from_pretrained(data.id);
    state.transcriber = await transformers.AutoModelForVision2Seq.from_pretrained(data.id, {
      "device": data.device,
      "dtype": data.dtype,
      "progress_callback": function (tick) {
        if (tick.status === "progress") self.postMessage({"type": "progress", "file": tick.file, "loaded": tick.loaded, "total": tick.total});
      }
    });
    self.postMessage({"type": "loaded"});
  } catch (err) {
    fail("init", err);
  }
};

/*  */
const run = async function (data) {
  try {
    /*
      a fresh run disarms the cancel latch of a previous one
    */
    state.aborted = false;
    const image = await transformers.load_image(data.file);
    const messages = [
      {
        "role": "user",
        "content": [
          {
            "type": "image"
          },
          {
            "type": "text",
            "text": "Convert this page to docling."
          }
        ]
      }
    ];
    const prompt = state.processor.apply_chat_template(messages, {"add_generation_prompt": true});
    const inputs = await state.processor(prompt, [image], {"do_image_splitting": true});
    /*  */
    self.postMessage({"type": "phase", "name": "running"});
    const res = {"chunks": ''};
    /* both streamers share one callback: it accumulates the full text
       for the done message (the non-streaming stance must accumulate
       too, or the run resolves empty) and relays chunks only in live
       mode - the abort check lives here, so cancel works in both
       streaming stances */
    const relay = function (e) {
      if (state.aborted) throw new Error("cancelled by user");
      res.chunks += e;
      if (data.streaming) self.postMessage({"type": "token", "text": e});
    };
    const Streamer = data.streaming ? Live : transformers.TextStreamer;
    const streamer = new Streamer(state.processor.tokenizer, {
      "skip_prompt": true,
      "skip_special_tokens": false,
      "callback_function": relay
    });
    await state.transcriber.generate({
      ...inputs,
      "max_new_tokens": 4096,
      "streamer": streamer
    });
    self.postMessage({"type": "done", "text": res.chunks});
  } catch (err) {
    fail("run", err);
  }
};

/*  */
self.onmessage = async function (e) {
  const data = e.data || {};
  if (data.type === "init") await init(data);
  else if (data.type === "run") await run(data);
  else if (data.type === "cancel") state.aborted = true;
};
