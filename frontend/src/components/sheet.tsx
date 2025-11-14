import React, { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hands, HAND_CONNECTIONS } from "@mediapipe/hands";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";
import * as cam from "@mediapipe/camera_utils";

const Sheet: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);

  const lastPosition = useRef<{ x: number; y: number } | null>(null);
  const smoothPosition = useRef<{ x: number; y: number } | null>(null);

  const currentColorRef = useRef("blue");
  const brushSizeRef = useRef(4);

  // 🔥 FIXED: renamed to avoid shadowing state setters
  const historyStackRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const isDrawingRef = useRef(true);

  // actual React state
  const [drawingHistory, setDrawingHistory] = useState<string[]>([]);
  const [historyStep, setHistoryStep] = useState<number>(-1);

  const [isDrawing, setIsDrawing] = useState(true);
  const [strokeColor, setStrokeColor] = useState("blue");
  const [brushSize, setBrushSize] = useState(4);
  const [gallery, setGallery] = useState<string[]>([]);
  const [gesture, setGesture] = useState("none");

  const alpha = 0.15;
  const navigate = useNavigate();

  useEffect(() => {
    isDrawingRef.current = isDrawing;
  }, [isDrawing]);

  // 🔥 FIXED: save history (no setter shadow)
  const saveToHistory = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    try {
      const imageData = canvas.toDataURL();
      const currentStep = historyIndexRef.current;

      historyStackRef.current = historyStackRef.current.slice(0, currentStep + 1);
      historyStackRef.current.push(imageData);

      historyIndexRef.current = historyStackRef.current.length - 1;

      setDrawingHistory([...historyStackRef.current]);
      setHistoryStep(historyIndexRef.current);
    } catch (error) {
      console.error("Error saving to history:", error);
    }
  };

  // 🔥 FIXED: undo (no setter shadow)
  const performUndo = () => {
    const currentStep = historyIndexRef.current;

    if (currentStep <= 0) return;

    const newStep = currentStep - 1;
    const targetImage = historyStackRef.current[newStep];
    if (!targetImage) return;

    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      historyIndexRef.current = newStep;
      setHistoryStep(newStep);
    };
    img.src = targetImage;

    lastPosition.current = null;
    smoothPosition.current = null;
  };

  const clearCanvas = () => {
    const drawCanvas = drawCanvasRef.current;
    if (drawCanvas) {
      const ctx = drawCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      }
      lastPosition.current = null;
      smoothPosition.current = null;
      saveToHistory();
    }
  };

  const saveCanvas = () => {
    const canvas = drawCanvasRef.current;
    if (canvas) {
      const dataURL = canvas.toDataURL("image/png");
      setGallery((prev) => [...prev, dataURL]);
      localStorage.setItem("gallery", JSON.stringify([...gallery, dataURL]));
      alert("Drawing saved to gallery!");
    }
  };

  useEffect(() => {
    currentColorRef.current = strokeColor;
    lastPosition.current = null;
    smoothPosition.current = null;
  }, [strokeColor]);

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveToHistory();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // 🔥 FIXED: gesture return type to avoid TS2367
  const detectGesture = (landmarks: any[]): string => {
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];
    const thumbTip = landmarks[4];
    const thumbCmc = landmarks[2];

    const indexUp = indexTip.y < indexPip.y - 0.03;
    const middleUp = middleTip.y < middlePip.y - 0.03;
    const ringUp = ringTip.y < ringPip.y - 0.03;
    const pinkyUp = pinkyTip.y < pinkyPip.y - 0.03;
    const thumbOut = Math.abs(thumbTip.x - thumbCmc.x) > 0.08;

    if (indexUp && !middleUp && !ringUp && !pinkyUp && !thumbOut) return "Drawing";
    if (indexUp && middleUp && !ringUp && !pinkyUp) return "Undo";
    if (indexUp && middleUp && ringUp && !pinkyUp) return "ColorChange";
    if (thumbOut && !indexUp && !middleUp && !ringUp && !pinkyUp) return "BrushIncrease";
    if (!thumbOut && !indexUp && !middleUp && !ringUp && pinkyUp) return "BrushDecrease";
    if (!indexUp && !middleUp && !ringUp && !pinkyUp) return "Clear";
    if (indexUp && middleUp && ringUp && pinkyUp) return "Palm";

    return "None";
  };

  useEffect(() => {
    const videoElement = videoRef.current;
    const cameraCanvas = cameraCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;

    if (!videoElement || !cameraCanvas || !drawCanvas) return;

    const drawCtx = drawCanvas.getContext("2d");
    const cameraCtx = cameraCanvas.getContext("2d");

    if (!drawCtx || !cameraCtx) return;

    let lastGestureAction = "";
    let gestureFrameCount = 0;
    const GESTURE_THRESHOLD = 15;
    let strokeCount = 0;
    const SAVE_AFTER_STROKES = 30;

    const hands = new Hands({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults((results:any) => {
      cameraCtx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);

      cameraCtx.save();
      cameraCtx.translate(cameraCanvas.width, 0);
      cameraCtx.scale(-1, 1);
      cameraCtx.drawImage(
        results.image,
        0,
        0,
        cameraCanvas.width,
        cameraCanvas.height
      );
      cameraCtx.restore();

      if (
        results.multiHandLandmarks &&
        results.multiHandLandmarks.length > 0
      ) {
        const landmarks = results.multiHandLandmarks[0];
        const indexTip = landmarks[8];

        const detectedGesture = isDrawingRef.current
          ? detectGesture(landmarks)
          : "None";

        setGesture(detectedGesture);

        cameraCtx.save();
        cameraCtx.translate(cameraCanvas.width, 0);
        cameraCtx.scale(-1, 1);

        drawConnectors(cameraCtx, landmarks, HAND_CONNECTIONS, {
          color: "#FFFFFF",
          lineWidth: 2,
        });
        drawLandmarks(cameraCtx, landmarks, {
          color: "#FF0000",
          lineWidth: 1,
        });

        cameraCtx.restore();

        if (!isDrawingRef.current) {
          lastPosition.current = null;
          return;
        }

        const rawX = (1 - indexTip.x) * drawCanvas.width;
        const rawY = indexTip.y * drawCanvas.height;

        if (!smoothPosition.current) {
          smoothPosition.current = { x: rawX, y: rawY };
        } else {
          smoothPosition.current.x =
            alpha * rawX + (1 - alpha) * smoothPosition.current.x;
          smoothPosition.current.y =
            alpha * rawY + (1 - alpha) * smoothPosition.current.y;
        }

        const canvasX = smoothPosition.current.x;
        const canvasY = smoothPosition.current.y;

        const rect = drawCanvas.getBoundingClientRect();
        const cursorX = (1 - indexTip.x) * rect.width;
        const cursorY = indexTip.y * rect.height;

        if (cursorRef.current) {
          cursorRef.current.style.left = `${cursorX - brushSizeRef.current}px`;
          cursorRef.current.style.top = `${cursorY - brushSizeRef.current}px`;
        }

        // Gesture Actions
        if (detectedGesture === "Clear") {
          gestureFrameCount++;
          if (
            gestureFrameCount >= GESTURE_THRESHOLD &&
            lastGestureAction !== "Clear"
          ) {
            drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
            lastPosition.current = null;
            smoothPosition.current = null;
            saveToHistory();
            lastGestureAction = "Clear";
            gestureFrameCount = 0;
            strokeCount = 0;
          }
        } else if (detectedGesture === "Undo") {
          gestureFrameCount++;
          if (
            gestureFrameCount >= GESTURE_THRESHOLD &&
            lastGestureAction !== "Undo"
          ) {
            performUndo();
            lastGestureAction = "Undo";
            gestureFrameCount = 0;
          }
        } else if (detectedGesture === "ColorChange") {
          gestureFrameCount++;
          if (
            gestureFrameCount >= GESTURE_THRESHOLD &&
            lastGestureAction !== "ColorChange"
          ) {
            const colors = [
              "blue",
              "red",
              "green",
              "black",
              "orange",
              "purple",
              "yellow",
            ];
            const currentIndex = colors.indexOf(currentColorRef.current);
            const nextColor = colors[(currentIndex + 1) % colors.length];

            setStrokeColor(nextColor);
            currentColorRef.current = nextColor;

            lastGestureAction = "ColorChange";
            gestureFrameCount = 0;

            lastPosition.current = null;
            smoothPosition.current = null;
          }
        } else if (detectedGesture === "BrushIncrease") {
          gestureFrameCount++;
          if (
            gestureFrameCount >= GESTURE_THRESHOLD &&
            lastGestureAction !== "BrushIncrease"
          ) {
            const newSize = Math.min(brushSizeRef.current + 2, 20);
            setBrushSize(newSize);
            brushSizeRef.current = newSize;

            lastGestureAction = "BrushIncrease";
            gestureFrameCount = 0;

            lastPosition.current = null;
            smoothPosition.current = null;
          }
        } else if (detectedGesture === "BrushDecrease") {
          gestureFrameCount++;
          if (
            gestureFrameCount >= GESTURE_THRESHOLD &&
            lastGestureAction !== "BrushDecrease"
          ) {
            const newSize = Math.max(brushSizeRef.current - 2, 1);
            setBrushSize(newSize);
            brushSizeRef.current = newSize;

            lastGestureAction = "BrushDecrease";
            gestureFrameCount = 0;

            lastPosition.current = null;
            smoothPosition.current = null;
          }
        } else if (detectedGesture === "Drawing") {
          if (lastGestureAction !== "") lastGestureAction = "";
          gestureFrameCount = 0;

          if (!lastPosition.current) {
            drawCtx.beginPath();
            drawCtx.arc(
              canvasX,
              canvasY,
              brushSizeRef.current / 2,
              0,
              2 * Math.PI
            );
            drawCtx.fillStyle = currentColorRef.current;
            drawCtx.fill();
          } else {
            drawCtx.strokeStyle = currentColorRef.current;
            drawCtx.lineWidth = brushSizeRef.current;
            drawCtx.lineCap = "round";
            drawCtx.lineJoin = "round";
            drawCtx.beginPath();
            drawCtx.moveTo(lastPosition.current.x, lastPosition.current.y);
            drawCtx.lineTo(canvasX, canvasY);
            drawCtx.stroke();

            strokeCount++;
            if (strokeCount >= SAVE_AFTER_STROKES) {
              saveToHistory();
              strokeCount = 0;
            }
          }

          lastPosition.current = { x: canvasX, y: canvasY };
        } else {
          if (
            lastPosition.current !== null &&
            detectedGesture !== "Clear" &&
            detectedGesture !== "Undo"
          ) {
            saveToHistory();
            strokeCount = 0;
          }

          if (detectedGesture !== lastGestureAction) gestureFrameCount = 0;

          lastPosition.current = null;
        }
      } else {
        lastPosition.current = null;
        setGesture("none");
      }
    });

    const camera = new cam.Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 280,
      height: 280,
    });

    camera.start();

    return () => {
      camera.stop();
    };
  }, []);

  const colors = [
    "blue",
    "red",
    "green",
    "black",
    "orange",
    "purple",
    "yellow",
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="w-[35%] flex flex-col p-4 gap-4 bg-gradient-to-b from-slate-800/50 to-slate-900/50">
        <div className="relative h-[60%] overflow-hidden bg-black shadow-2xl rounded-2xl">
          <video ref={videoRef} className="hidden" autoPlay playsInline muted />
          <canvas
            ref={cameraCanvasRef}
            width={640}
            height={480}
            className="object-cover w-full h-full"
          />

          <div className="absolute px-3 py-2 shadow-lg top-3 left-3 bg-emerald-600/90 backdrop-blur-md rounded-xl">
            <div className="text-xs font-semibold text-emerald-100">
              Gesture
            </div>
            <div className="text-sm font-bold text-white">{gesture}</div>
          </div>

          <div className="absolute top-3 right-3">
            <div
              className={`w-3 h-3 border-2 border-white rounded-full ${
                isDrawing ? "bg-red-500 animate-pulse" : "bg-gray-500"
              }`}
            ></div>
          </div>
        </div>

        <div className="flex flex-col gap-3 p-4 shadow-xl bg-slate-800/70 backdrop-blur-md rounded-2xl">
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setIsDrawing((prev) => !prev)}
              className={`w-24 px-3 py-2 text-sm font-bold text-white rounded-lg shadow-md transition-all ${
                isDrawing
                  ? "bg-green-500 hover:bg-green-600"
                  : "bg-gray-500 hover:bg-gray-600"
              }`}
            >
              {isDrawing ? "Stop" : "Start"}
            </button>
            <button
              onClick={clearCanvas}
              className="w-24 px-3 py-2 text-sm font-bold text-white transition-all bg-red-500 rounded-lg shadow-md hover:bg-red-600"
            >
              Clear
            </button>
            <button
              onClick={performUndo}
              className="w-24 px-3 py-2 text-sm font-bold text-white transition-all bg-purple-600 rounded-lg shadow-md hover:bg-purple-700"
            >
              Undo
            </button>
          </div>

          <div className="flex justify-center gap-2">
            <button
              onClick={saveCanvas}
              className="w-24 px-3 py-2 text-sm font-bold text-white transition-all bg-blue-500 rounded-lg shadow-md hover:bg-blue-600"
            >
              Save
            </button>
            <button
              onClick={() => navigate("/gallery")}
              className="w-24 px-3 py-2 text-sm font-bold text-white transition-all bg-indigo-600 rounded-lg shadow-md hover:bg-indigo-700"
            >
              Gallery
            </button>
          </div>

          <div className="pt-2 mt-2 border-t border-slate-600">
            <div className="mb-2 text-xs font-semibold text-center text-gray-300">
              Color Palette
            </div>
            <div className="flex justify-center gap-2">
              {colors.map((color) => (
                <div
                  key={color}
                  onClick={() => setStrokeColor(color)}
                  className={`w-10 h-10 rounded-full cursor-pointer transition-all hover:scale-110 ${
                    strokeColor === color
                      ? "ring-4 ring-white scale-110 shadow-xl"
                      : "ring-2 ring-gray-400/50"
                  }`}
                  style={{ backgroundColor: color }}
                ></div>
              ))}
            </div>
          </div>

          <div className="pt-2 mt-2 border-t border-slate-600">
            <div className="mb-2 text-xs font-semibold text-center text-gray-300">
              Brush Size: {brushSize}px
            </div>
            <div className="mb-2 text-[10px] text-center text-gray-400">
              👍 Thumbs Up +2px | 🤙 Pinky -2px
            </div>

            <input
              type="range"
              min="1"
              max="20"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />

            <div className="flex justify-between mt-1 text-xs text-gray-400">
              <span>1px</span>
              <span>20px</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        <div className="relative w-full h-full">
          <div className="relative w-full h-full overflow-hidden bg-white shadow-2xl rounded-2xl">
            <canvas
              ref={drawCanvasRef}
              width={1600}
              height={900}
              className="w-full h-full"
            />
            <div
              ref={cursorRef}
              className="absolute border-2 border-white rounded-full shadow-lg pointer-events-none"
              style={{
                backgroundColor: strokeColor,
                width: `${Math.max(brushSize * 2, 8)}px`,
                height: `${Math.max(brushSize * 2, 8)}px`,
              }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sheet;
