import React, { useRef, useEffect } from 'react';
import { Hands } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import * as cam from '@mediapipe/camera_utils';
import { HAND_CONNECTIONS } from "@mediapipe/hands";

const GestureRecognizer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPosition = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current!;
    const canvasElement = canvasRef.current!;
    const drawCanvas = drawCanvasRef.current!;
    const drawCtx = drawCanvas.getContext('2d')!;

    const hands = new Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults((results:any) => {
      const ctx = canvasElement.getContext('2d')!;
      ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

      // Flip video feed and draw it on canvas
      ctx.save();
      ctx.translate(canvasElement.width, 0);  
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
      ctx.restore();

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        // Flip and draw hand landmarks
        ctx.save();
        ctx.translate(canvasElement.width, 0);
        ctx.scale(-1, 1);
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
            color: "#00FF00",
             lineWidth: 3
          });
        drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 1 });
        ctx.restore();

        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];

        const isPointing =
          indexTip.y < middleTip.y &&
          indexTip.y < ringTip.y &&
          indexTip.y < pinkyTip.y;

        const isFist = [indexTip, middleTip, ringTip, pinkyTip].every(
          (tip) => tip.y > landmarks[0].y + 0.1
        );

        const x = drawCanvas.width - (indexTip.x * drawCanvas.width);
        const y = indexTip.y * drawCanvas.height;

        if (isFist) {
          drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
          lastPosition.current = null;
        } else if (isPointing) {
          if (lastPosition.current) {
            drawCtx.strokeStyle = 'red';
            drawCtx.lineWidth = 5;
            drawCtx.beginPath();
            drawCtx.moveTo(lastPosition.current.x, lastPosition.current.y);
            drawCtx.lineTo(x, y);
            drawCtx.stroke();
          }
          lastPosition.current = { x, y };
        } else {
          lastPosition.current = null;
        }
      }
    });

    const camera = new cam.Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 640,
      height: 480,
    });
    camera.start();
  }, []);

  return (
    <div className="relative w-[640px] h-[480px] mx-auto rounded-xl shadow-md">
      <video ref={videoRef} className="hidden" autoPlay playsInline muted />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="absolute top-0 left-0 z-10 rounded-xl"
      />
      <canvas
        ref={drawCanvasRef}
        width={640}
        height={480}
        className="absolute top-0 left-0 z-20 rounded-xl"
      />
    </div>
  );
};

export default GestureRecognizer;
