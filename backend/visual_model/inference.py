import os
import torch
import torch.nn.functional as F
import numpy as np
from PIL import Image
from .model import get_segformer_model

# Configuration
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'weights.pt')
DEVICE = 'cpu'
IMAGE_SIZE = 512

_model_instance = None

def get_model():
    global _model_instance
    if _model_instance is None:
        print('Loading SegFormer model...')
        model = get_segformer_model(num_classes=2, pretrained=False, device=DEVICE)
        model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
        model.eval()
        _model_instance = model
    return _model_instance

def preprocess_image(image_path):
    image = Image.open(image_path).convert('RGB')
    original_size = image.size
    image = image.resize((IMAGE_SIZE, IMAGE_SIZE), Image.BILINEAR)
    
    img_array = np.array(image).astype(np.float32) / 255.0
    img_tensor = torch.tensor(img_array).permute(2, 0, 1)
    
    mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)
    img_tensor = (img_tensor - mean) / std
    
    return img_tensor.unsqueeze(0), original_size


def run_tamper_detection(image_path):
    try:
        model = get_model()
        input_tensor, original_size = preprocess_image(image_path)
        
        with torch.no_grad():
            outputs = model(pixel_values=input_tensor)
            logits = outputs.logits
            
            # Interpolate to original size for better overlay
            logits = F.interpolate(
                logits, size=original_size[::-1], # (H, W)
                mode='bilinear', align_corners=False
            )
            
            probs = torch.sigmoid(logits[:, 1])
            prob_map = probs.squeeze().cpu().numpy()
            
        # 1. Improved Confidence Metric (Top 1% average instead of global mean)
        # This catches small forgeries that global mean misses
        threshold_percentile = np.percentile(prob_map, 99)
        confidence_score = float(threshold_percentile)
        
        is_tampered = confidence_score > 0.5  # Stricter threshold for the top 1%

        # 2. Generate Heatmap Visualization
        import matplotlib.pyplot as plt
        import io
        import base64

        # Create a custom colormap or use 'jet' but with ALPHA channel based on probability
        # We want high probability = visible, low probability = transparent
        
        # Create an RGBA image manually for full control
        # Colormap 'jet': Blue (low) -> Red (high)
        cmap = plt.get_cmap('jet')
        
        # Normalize probs to 0-1 for colormap
        norm_probs = (prob_map - prob_map.min()) / (prob_map.max() - prob_map.min() + 1e-8)
        
        # Apply colormap
        rgba_img = cmap(norm_probs) # Returns (H, W, 4)
        
        # Set Alpha channel: 
        # Make regions with low probability (< 0.5) very transparent to invisible
        # Make regions with high probability opaque
        # We can use the probability map itself as the alpha base
        
        # Sigmoid-like opacity curve or simple threshold
        alpha_channel = prob_map.copy()
        alpha_channel[alpha_channel < 0.2] = 0.0 # Clear background
        alpha_channel[(alpha_channel >= 0.2) & (alpha_channel < 0.5)] = 0.3 # Slight tint for uncertain
        alpha_channel[alpha_channel >= 0.5] = 0.8 # High visibility for tampered
        
        rgba_img[:, :, 3] = alpha_channel
        
        # Save to buffer
        buf = io.BytesIO()
        plt.imsave(buf, rgba_img, format='png')
        buf.seek(0)
        heatmap_base64 = base64.b64encode(buf.getvalue()).decode('utf-8')

        return {
            'is_tampered': is_tampered,
            'confidence_score': confidence_score,
            'details': 'SegFormer Deep Learning Model',
            'heatmap_image': f"data:image/png;base64,{heatmap_base64}"
        }
        
    except Exception as e:
        print(f'SegFormer Inference Failed: {e}')
        # Return a safe fallback so the app doesn't crash
        return {
            'is_tampered': False,
            'confidence_score': 0.0,
            'error': str(e),
            'details': 'Inference Error'
        }

