import os
import torch
import numpy as np
import torch.nn.functional as F
from PIL import Image
import sys
from pathlib import Path

# Add backend root to sys.path 
backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.append(str(backend_root))

# Add trufor_core to sys.path so 'import lib' works
trufor_core_path = backend_root / 'models' / 'trufor_core'
if str(trufor_core_path) not in sys.path:
    sys.path.append(str(trufor_core_path))

try:
    from lib.config import config as default_cfg
    from lib.config import update_config
    from lib.utils import get_model
    TruForFactory = get_model
except ImportError as e:
    print(f"Warning: TruFor core modules not found. Error: {e}")
    TruForFactory = None
    default_cfg = None

class TruForEngine:
    _instance = None
    _model = None
    _device = "cuda" if torch.cuda.is_available() else "cpu"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TruForEngine, cls).__new__(cls)
            cls._instance._load_model()
        return cls._instance

    def _load_model(self):
        if TruForFactory is None:
            print("TruFor dependencies missing. Skipping model load.")
            return

        print(f"Loading TruFor Model on {self._device}...")
        
        try:
            # 1. Load Configuration
            # We use the default config from lib.config and merge our yaml
            conf_path = trufor_core_path / 'lib' / 'config' / 'trufor_ph3.yaml'
            
            cfg = default_cfg
            if conf_path.exists():
                cfg.merge_from_file(str(conf_path))
            
            # MODEL.DEVICE does not exist in TruFor config, and we handle .to(device) manually below
            # cfg.merge_from_list(["MODEL.DEVICE", self._device])
            
            # 2. Initialize Architecture via Factory
            self._model = TruForFactory(cfg)
            
            # 3. Load Weights
            weights_path = trufor_core_path / 'weights' / 'trufor.pth.tar'
            if not weights_path.exists():
                # Fallback check
                weights_path = trufor_core_path / 'trufor.pth.tar'
            
            if not weights_path.exists():
                print(f"Warning: Missing TruFor weights at {weights_path}")
                return
                
            checkpoint = torch.load(weights_path, map_location=self._device, weights_only=False)
            self._model.load_state_dict(checkpoint['state_dict'])
            self._model.eval()
            self._model.to(self._device)
            print("TruFor Model Loaded Successfully.")
            
        except Exception as e:
            print(f"TruFor Load Error: {e}")
            self._model = None

    def analyze(self, image_path: str):
        """
        Returns:
            - anomaly_map: 0-1 float array (The forgery heatmap)
            - confidence_map: 0-1 float array (How much to trust the heatmap)
            - score: Global integrity score (0 = Fake, 1 = Real)
        """
        if self._model is None:
            return {
                "heatmap": None,
                "confidence_map": None, 
                "trust_score": 1.0, # Fail safe
                "error": "Model not loaded"
            }

        try:
            # 1. Preprocessing
            img = Image.open(image_path).convert('RGB')
            original_size = img.size
            
            # Limit size for T4/CPU stability
            if max(original_size) > 1024:
                img.thumbnail((1024, 1024))
            
            img_tensor = self._transform_image(img).to(self._device)

            # 2. Inference
            with torch.no_grad():
                # TruFor outputs a tuple: (pred, conf, det, npp)
                # pred: Anomaly map logits (B, 2, H, W)
                # conf: Confidence map logits (B, 1, H, W)
                pred, conf, det, npp = self._model(img_tensor)
            
            # Post-process Anomaly Map (Softmax -> Class 1)
            # pred shape: (1, 2, H, W)
            pred_prob = torch.softmax(pred, dim=1)[:, 1, :, :] # Take forgery class
            
            # Post-process Confidence Map (Sigmoid)
            # conf shape: (1, 1, H, W)
            if conf is not None:
                conf_prob = torch.sigmoid(conf).squeeze(1)
            else:
                conf_prob = torch.ones_like(pred_prob)

            # 3. Extract & Resize back to original
            # Pass already-processed 0-1 tensors (cpu numpy)
            anomaly = self._resize_map(pred_prob.squeeze().cpu().numpy(), original_size)
            confidence = self._resize_map(conf_prob.squeeze().cpu().numpy(), original_size)
            
            # 4. Calculate Global Score
            # We weigh the anomaly score by the confidence.
            # If anomaly is high but confidence is low, we ignore it.
            weighted_anomaly = anomaly * confidence
            global_score = 1.0 - np.max(weighted_anomaly) # Simple heuristic

            # Save heatmap for frontend (return as array, pipeline handles saving)
            return {
                "heatmap": weighted_anomaly, 
                "raw_confidence": confidence,
                "trust_score": float(global_score),
                "verdict": "Forged" if global_score < 0.5 else "Authentic"
            }
        except Exception as e:
            print(f"TruFor Analysis Failed: {e}")
            import traceback
            traceback.print_exc()
            return {"trust_score": 1.0, "error": str(e)}

    def _transform_image(self, img):
        # Standard RGB normalization for TruFor
        arr = np.array(img).astype(np.float32) / 255.0
        arr = np.transpose(arr, (2, 0, 1)) # HWC -> CHW
        return torch.tensor(arr).unsqueeze(0) # Add batch dim

    def _resize_map(self, prob_map, target_size):
        # Resize to original image dimensions for overlay
        # prob_map is already 0-1 float numpy array
        prob_img = Image.fromarray((prob_map * 255).astype(np.uint8))
        prob_img = prob_img.resize(target_size, Image.BILINEAR)
        return np.array(prob_img) / 255.0
