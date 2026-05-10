import { useState, useRef, useCallback, DragEvent } from "react";
import piexif from "piexifjs";

type Mode = "image" | "text";

const AI_WORD_MAP: Record<string, string[]> = {
  "moreover": ["also", "plus", "and", "on top of that"],
  "furthermore": ["also", "what's more", "and", "besides"],
  "additionally": ["also", "plus", "as well", "on top of that"],
  "subsequently": ["then", "after that", "next", "later"],
  "consequently": ["so", "as a result", "because of that", "therefore"],
  "therefore": ["so", "that's why", "because of this"],
  "thus": ["so", "this way", "as a result"],
  "hence": ["so", "that's why", "this means"],
  "nevertheless": ["still", "even so", "but", "yet"],
  "nonetheless": ["still", "even so", "but", "yet"],
  "notwithstanding": ["still", "even so", "despite that"],
  "delve": ["look", "dig", "explore", "go into"],
  "delves": ["looks", "digs", "explores", "goes into"],
  "delving": ["looking", "digging", "exploring", "going into"],
  "delved": ["looked", "dug", "explored", "went into"],
  "utilize": ["use", "apply", "work with"],
  "utilizes": ["uses", "applies", "works with"],
  "utilized": ["used", "applied", "worked with"],
  "utilizing": ["using", "applying", "working with"],
  "facilitate": ["help", "make easier", "support"],
  "facilitates": ["helps", "makes easier", "supports"],
  "leverage": ["use", "make use of", "apply"],
  "leverages": ["uses", "makes use of", "applies"],
  "leveraging": ["using", "making use of", "applying"],
  "paramount": ["most important", "key", "critical"],
  "multifaceted": ["complex", "many-sided", "layered"],
  "nuanced": ["detailed", "subtle", "complex"],
  "comprehensive": ["full", "complete", "thorough"],
  "robust": ["strong", "solid", "reliable"],
  "pivotal": ["key", "central", "critical"],
  "crucial": ["key", "important", "critical"],
  "imperative": ["important", "necessary", "needed"],
  "it is worth noting": ["note that", "keep in mind", "remember"],
  "it should be noted": ["note that", "keep in mind"],
  "in conclusion": ["to wrap up", "in short", "finally"],
  "in summary": ["to sum up", "in short", "overall"],
  "to summarize": ["to sum up", "in short"],
  "in essence": ["basically", "in short", "at its core"],
  "as previously mentioned": ["as I said", "as noted", "earlier"],
  "first and foremost": ["first", "to start", "above all"],
  "last but not least": ["finally", "and one more thing"],
  "in light of": ["given", "considering", "because of"],
  "with regard to": ["about", "on", "regarding"],
  "with respect to": ["about", "on", "for"],
  "in terms of": ["for", "about", "when it comes to"],
  "elucidate": ["explain", "clarify", "make clear"],
  "elucidates": ["explains", "clarifies", "makes clear"],
  "underscore": ["highlight", "stress", "emphasize"],
  "underscores": ["highlights", "stresses", "emphasizes"],
  "endeavor": ["try", "effort", "attempt"],
  "endeavors": ["tries", "efforts", "attempts"],
  "commendable": ["good", "impressive", "noteworthy"],
  "intricate": ["complex", "detailed", "involved"],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function humanizeText(input: string): string {
  let result = input;

  for (const [phrase, replacements] of Object.entries(AI_WORD_MAP)) {
    const regex = new RegExp(`\\b${phrase}\\b`, "gi");
    result = result.replace(regex, (match) => {
      const replacement = pickRandom(replacements);
      // preserve capitalization
      if (match[0] === match[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }

  // Inject 2-3 natural line breaks by splitting at sentence boundaries
  const sentences = result.match(/[^.!?]+[.!?]+/g) || [result];
  if (sentences.length > 4) {
    const breakCount = Math.floor(Math.random() * 2) + 2; // 2 or 3
    const step = Math.floor(sentences.length / (breakCount + 1));
    const insertPositions = new Set<number>();
    for (let i = 1; i <= breakCount; i++) {
      insertPositions.add(i * step);
    }
    result = sentences
      .map((s, i) => (insertPositions.has(i) ? "\n\n" + s : s))
      .join("");
  }

  return result.trim();
}

function dataURLtoArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function arrayBufferToDataURL(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function scrubImageExif(dataUrl: string): string {
  try {
    // Load existing EXIF or start fresh
    let exifObj: ReturnType<typeof piexif.load>;
    try {
      exifObj = piexif.load(dataUrl);
    } catch {
      exifObj = { "0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": null };
    }

    // Clear ALL fields completely, then set only our spoofed values
    const clean0th: Record<number, unknown> = {};
    const cleanExif: Record<number, unknown> = {};

    // Set spoofed Make/Model/Software in IFD0
    clean0th[piexif.ImageIFD.Make] = "Apple";
    clean0th[piexif.ImageIFD.Model] = "iPhone 11";
    clean0th[piexif.ImageIFD.Software] = "iOS 15.0";

    const newExifObj = {
      "0th": clean0th,
      "Exif": cleanExif,
      "GPS": {},
      "1st": {},
      "thumbnail": null as null,
    };

    const exifBytes = piexif.dump(newExifObj);
    return piexif.insert(exifBytes, dataUrl);
  } catch (err) {
    console.error("EXIF scrub error:", err);
    return dataUrl;
  }
}

export default function App() {
  const [mode, setMode] = useState<Mode>("image");

  // Image state
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [scrubbedDataUrl, setScrubbedDataUrl] = useState<string | null>(null);
  const [imageDragging, setImageDragging] = useState(false);
  const [imageStatus, setImageStatus] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Text state
  const [textInput, setTextInput] = useState("");
  const [textOutput, setTextOutput] = useState("");
  const [textFileName, setTextFileName] = useState<string | null>(null);
  const [textDragging, setTextDragging] = useState(false);
  const textInputRef = useRef<HTMLInputElement>(null);

  // ---- IMAGE HANDLERS ----
  const handleImageFile = useCallback((file: File) => {
    if (!file.type.match(/image\/(jpeg|png)/)) {
      setImageStatus("Only JPG and PNG files are supported.");
      return;
    }
    setImageName(file.name);
    setScrubbedDataUrl(null);
    setImageStatus("Loading...");

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImageDataUrl(dataUrl);
      setImageStatus("Image loaded. Ready to scrub.");
    };
    reader.readAsDataURL(file);
  }, []);

  const handleImageDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setImageDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  };

  const handleScrubImage = () => {
    if (!imageDataUrl) return;
    setImageStatus("Scrubbing metadata...");
    try {
      const result = scrubImageExif(imageDataUrl);
      setScrubbedDataUrl(result);
      setImageStatus("Done. Metadata stripped and spoofed.");
    } catch {
      setImageStatus("Error scrubbing image. Try another file.");
    }
  };

  const handleDownloadImage = () => {
    if (!scrubbedDataUrl || !imageName) return;
    const a = document.createElement("a");
    a.href = scrubbedDataUrl;
    const ext = imageName.toLowerCase().endsWith(".png") ? ".png" : ".jpg";
    a.download = `scrubbed_${imageName.replace(/\.[^.]+$/, "")}${ext}`;
    a.click();
  };

  const handleImageReset = () => {
    setImageDataUrl(null);
    setScrubbedDataUrl(null);
    setImageName(null);
    setImageStatus(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  // ---- TEXT HANDLERS ----
  const handleTextFile = useCallback((file: File) => {
    if (!file.name.endsWith(".txt")) {
      setTextFileName("Only .txt files are supported.");
      return;
    }
    setTextFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      setTextInput(e.target?.result as string);
      setTextOutput("");
    };
    reader.readAsText(file);
  }, []);

  const handleTextDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setTextDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleTextFile(file);
  };

  const handleHumanize = () => {
    if (!textInput.trim()) return;
    setTextOutput(humanizeText(textInput));
  };

  const handleDownloadText = () => {
    if (!textOutput) return;
    const blob = new Blob([textOutput], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = textFileName ? `humanized_${textFileName}` : "humanized_output.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTextReset = () => {
    setTextInput("");
    setTextOutput("");
    setTextFileName(null);
    if (textInputRef.current) textInputRef.current.value = "";
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="w-full mb-8 text-center">
        <div className="inline-block border border-green-900 bg-[hsl(120_12%_11%)] px-4 py-1 mb-4 text-xs tracking-widest text-green-600 uppercase">
          ⚠ All processing is local — nothing leaves your device
        </div>
        <h1 className="text-4xl font-bold tracking-wider text-green-500 uppercase mb-1"
          style={{ textShadow: "0 0 18px rgba(60,160,60,0.5), 0 0 4px rgba(60,160,60,0.3)" }}>
          THE GHOST SCRUBBER
        </h1>
        <p className="text-sm text-muted-foreground tracking-wide">
          Strip image metadata. Humanize AI text. Leave no trace.
        </p>
      </div>

      {/* Mode Tabs */}
      <div className="w-full flex mb-8 border-b border-border">
        <button
          onClick={() => setMode("image")}
          className={`flex-1 py-4 text-base font-bold uppercase tracking-widest transition-colors ${mode === "image" ? "tab-active" : "tab-inactive hover:text-foreground"}`}
        >
          Image Scrubber
        </button>
        <button
          onClick={() => setMode("text")}
          className={`flex-1 py-4 text-base font-bold uppercase tracking-widest transition-colors ${mode === "text" ? "tab-active" : "tab-inactive hover:text-foreground"}`}
        >
          Text Humanizer
        </button>
      </div>

      {/* IMAGE MODE */}
      {mode === "image" && (
        <div className="w-full flex flex-col gap-6">
          {!imageDataUrl ? (
            <div
              className={`drop-zone rounded-md p-10 text-center cursor-pointer ${imageDragging ? "drag-over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setImageDragging(true); }}
              onDragLeave={() => setImageDragging(false)}
              onDrop={handleImageDrop}
              onClick={() => imageInputRef.current?.click()}
            >
              <div className="text-5xl mb-4">📷</div>
              <p className="text-base text-muted-foreground mb-1">Drop a JPG or PNG here</p>
              <p className="text-sm text-green-700">or tap to select a file</p>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Preview */}
              <div className="w-full rounded overflow-hidden border border-border bg-card">
                <img
                  src={scrubbedDataUrl ?? imageDataUrl}
                  alt="Preview"
                  className="w-full max-h-72 object-contain"
                />
              </div>

              {/* File info */}
              <div className="flex items-center justify-between px-1">
                <span className="text-sm text-muted-foreground truncate max-w-[60%]">
                  {imageName}
                </span>
                {imageStatus && (
                  <span className={`text-xs px-2 py-1 rounded border ${
                    scrubbedDataUrl
                      ? "text-green-400 border-green-800 bg-green-950"
                      : "text-yellow-400 border-yellow-800 bg-yellow-950"
                  }`}>
                    {imageStatus}
                  </span>
                )}
              </div>

              {/* EXIF info box */}
              <div className="bg-card border border-border rounded p-4 text-xs font-mono space-y-1">
                <div className="text-green-600 uppercase tracking-widest mb-2 text-[10px]">Spoofed EXIF Output</div>
                <div className="flex gap-2"><span className="text-muted-foreground w-24">Make</span><span className="text-foreground">Apple</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground w-24">Model</span><span className="text-foreground">iPhone 11</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground w-24">Software</span><span className="text-foreground">iOS 15.0</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground w-24">GPS</span><span className="text-red-500">STRIPPED</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground w-24">Timestamps</span><span className="text-red-500">STRIPPED</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground w-24">Camera data</span><span className="text-red-500">STRIPPED</span></div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-3">
                {!scrubbedDataUrl ? (
                  <button
                    onClick={handleScrubImage}
                    className="btn-primary-glow w-full py-5 bg-green-900 hover:bg-green-800 text-green-100 font-bold text-lg uppercase tracking-widest rounded border border-green-700"
                  >
                    SCRUB METADATA
                  </button>
                ) : (
                  <button
                    onClick={handleDownloadImage}
                    className="btn-primary-glow w-full py-5 bg-green-800 hover:bg-green-700 text-green-100 font-bold text-lg uppercase tracking-widest rounded border border-green-600"
                  >
                    DOWNLOAD CLEAN IMAGE
                  </button>
                )}
                <button
                  onClick={handleImageReset}
                  className="w-full py-4 bg-card hover:bg-secondary text-muted-foreground font-bold text-sm uppercase tracking-widest rounded border border-border transition-colors"
                >
                  LOAD DIFFERENT FILE
                </button>
              </div>
            </div>
          )}

          {/* Privacy note */}
          <div className="text-xs text-muted-foreground text-center px-4 border-t border-border pt-4">
            Your image never leaves your browser. All EXIF operations are performed locally using piexifjs.
          </div>
        </div>
      )}

      {/* TEXT MODE */}
      {mode === "text" && (
        <div className="w-full flex flex-col gap-5">
          {/* File drop zone */}
          <div
            className={`drop-zone rounded-md p-5 text-center cursor-pointer ${textDragging ? "drag-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setTextDragging(true); }}
            onDragLeave={() => setTextDragging(false)}
            onDrop={handleTextDrop}
            onClick={() => textInputRef.current?.click()}
          >
            <p className="text-sm text-muted-foreground">
              {textFileName ? `📄 ${textFileName}` : "Drop a .txt file here or tap to select"}
            </p>
            <input
              ref={textInputRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleTextFile(e.target.files[0])}
            />
          </div>

          {/* Input textarea */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-green-700 uppercase tracking-widest">Input Text</label>
            <textarea
              value={textInput}
              onChange={(e) => { setTextInput(e.target.value); setTextOutput(""); }}
              placeholder="Paste or type your AI-generated text here..."
              rows={8}
              className="w-full bg-card border border-border rounded p-4 text-sm text-foreground font-mono resize-y placeholder:text-muted-foreground focus:border-green-700 transition-colors"
            />
          </div>

          {/* Humanize button */}
          <button
            onClick={handleHumanize}
            disabled={!textInput.trim()}
            className="btn-primary-glow w-full py-5 bg-green-900 hover:bg-green-800 disabled:bg-card disabled:text-muted-foreground disabled:shadow-none disabled:border-border text-green-100 font-bold text-lg uppercase tracking-widest rounded border border-green-700 transition-all"
          >
            HUMANIZE TEXT
          </button>

          {/* Output textarea */}
          {textOutput && (
            <>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-green-700 uppercase tracking-widest">Humanized Output</label>
                  <span className="text-xs text-green-600 border border-green-800 bg-green-950 px-2 py-0.5 rounded">
                    AI words replaced
                  </span>
                </div>
                <textarea
                  value={textOutput}
                  onChange={(e) => setTextOutput(e.target.value)}
                  rows={8}
                  className="w-full bg-card border border-green-900 rounded p-4 text-sm text-foreground font-mono resize-y focus:border-green-700 transition-colors"
                />
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleDownloadText}
                  className="btn-primary-glow w-full py-5 bg-green-800 hover:bg-green-700 text-green-100 font-bold text-lg uppercase tracking-widest rounded border border-green-600"
                >
                  DOWNLOAD HUMANIZED TEXT
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(textOutput)}
                  className="w-full py-4 bg-card hover:bg-secondary text-muted-foreground font-bold text-sm uppercase tracking-widest rounded border border-border transition-colors"
                >
                  COPY TO CLIPBOARD
                </button>
              </div>
            </>
          )}

          <button
            onClick={handleTextReset}
            className="w-full py-4 bg-card hover:bg-secondary text-muted-foreground font-bold text-xs uppercase tracking-widest rounded border border-border transition-colors"
          >
            CLEAR ALL
          </button>

          {/* Word list preview */}
          <div className="bg-card border border-border rounded p-4 text-xs">
            <div className="text-green-700 uppercase tracking-widest mb-2 text-[10px]">AI Words Detected & Replaced</div>
            <div className="flex flex-wrap gap-1">
              {Object.keys(AI_WORD_MAP).slice(0, 20).map((word) => (
                <span key={word} className="bg-green-950 text-green-600 border border-green-900 px-2 py-0.5 rounded text-[10px] font-mono">
                  {word}
                </span>
              ))}
              <span className="text-muted-foreground text-[10px] px-2 py-0.5">
                +{Object.keys(AI_WORD_MAP).length - 20} more
              </span>
            </div>
          </div>

          <div className="text-xs text-muted-foreground text-center px-4 border-t border-border pt-4">
            All text processing is done locally in your browser. No data is sent anywhere.
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-10 text-center text-[10px] text-muted-foreground tracking-widest uppercase opacity-40">
        Ghost Scrubber — Stay off the grid
      </div>
    </div>
  );
}
