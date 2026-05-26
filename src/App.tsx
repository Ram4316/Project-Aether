/**
 * App — Root React component.
 * Manages the Babylon.js canvas and overlays HUD + mobile controls.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameScene } from './core/GameScene';
import { HUD } from './ui/components/HUD';
import { MobileControls } from './ui/components/MobileControls';
import type { InputManager } from './core/InputManager';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameScene | null>(null);
  const [inputManager, setInputManager] = useState<InputManager | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const initGame = useCallback(() => {
    if (!canvasRef.current || gameRef.current) return;

    try {
      const game = new GameScene(canvasRef.current);
      gameRef.current = game;
      setInputManager(game.inputManager);
      game.start();
      setIsLoaded(true);
      console.log('[App] Game initialized successfully');
    } catch (err) {
      console.error('[App] Failed to initialize game:', err);
    }
  }, []);

  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(initGame, 100);

    return () => {
      clearTimeout(timer);
      if (gameRef.current) {
        gameRef.current.dispose();
        gameRef.current = null;
      }
    };
  }, [initGame]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="game-container" id="game-container">
      <canvas
        ref={canvasRef}
        id="game-canvas"
        style={{
          width: '100vw',
          height: '100vh',
          display: 'block',
          outline: 'none',
          touchAction: 'none',
        }}
      />
      {isLoaded && (
        <>
          <HUD showPerf={true} />
          <MobileControls inputManager={inputManager} />
        </>
      )}
    </div>
  );
};

export default App;
