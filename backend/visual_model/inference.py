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
        input_tensor, _ = preprocess_image(image_path)
        
        with torch.no_grad():
            outputs = model(pixel_values=input_tensor)
            logits = outputs.logits
            
            logits = F.interpolate(
                logits, size=(IMAGE_SIZE, IMAGE_SIZE),
                mode='bilinear', align_corners=False
            )
            
            probs = torch.sigmoid(logits[:, 1])
            prob_map = probs.squeeze().cpu().numpy()
            
        confidence_mean = float(prob_map.mean().item())
        
        return {
            'is_tampered': confidence_mean > 0.02,
            'confidence_score': confidence_mean,
            'details': 'SegFormer Deep Learning Model'
        }
        
    except Exception as e:
        print(f'SegFormer Inference Failed: {e}')
        return {
            'is_tampered': False,
            'confidence_score': 0.0,
            'error': str(e)
        }
