import os
import json
import logging
from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer, util

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nlu_server")

# Create fallback logger
fallback_logger = logging.getLogger("nlu_fallbacks")
fh = logging.FileHandler("nlu_fallbacks.log")
fh.setLevel(logging.WARNING)
formatter = logging.Formatter('%(asctime)s - %(message)s')
fh.setFormatter(formatter)
fallback_logger.addHandler(fh)

# Load model
logger.info("Loading sentence-transformers/all-MiniLM-L6-v2...")
model = SentenceTransformer('all-MiniLM-L6-v2')
logger.info("Model loaded successfully.")

# Load taxonomy
taxonomy_path = os.path.join(os.path.dirname(__file__), "taxonomy.json")
try:
    with open(taxonomy_path, "r", encoding="utf-8") as f:
        taxonomy = json.load(f)
except Exception as e:
    logger.error(f"Failed to load taxonomy.json: {e}")
    taxonomy = []

# Pre-calculate embeddings for taxonomy
corpus_texts = []
corpus_mappings = []

for entry in taxonomy:
    trade = entry["trade"]
    # 1. Trade title itself
    corpus_texts.append(trade)
    corpus_mappings.append((trade, 1.0))
    
    # 2. Synonyms
    for syn in entry.get("synonyms", []):
        corpus_texts.append(syn)
        corpus_mappings.append((trade, 0.95))
        
    # 3. Description
    desc = entry.get("description", "")
    if desc:
        corpus_texts.append(desc)
        corpus_mappings.append((trade, 0.8))

logger.info(f"Encoding {len(corpus_texts)} corpus variants...")
corpus_embeddings = model.encode(corpus_texts, convert_to_tensor=True)
logger.info("Corpus variants encoded successfully.")

@app.route("/match", methods=["POST"])
def match_profession():
    data = request.get_json() or {}
    query = data.get("query", "").strip()
    threshold = float(data.get("threshold", 0.55))
    
    if not query:
        return jsonify({"matched": False, "error": "Query cannot be empty"}), 400
        
    # Embed query
    query_embedding = model.encode(query, convert_to_tensor=True)
    
    # Calculate cosine similarity
    cos_scores = util.cos_sim(query_embedding, corpus_embeddings)[0]
    
    # Find best match
    best_idx = int(cos_scores.argmax())
    best_score = float(cos_scores[best_idx])
    matched_trade, weight = corpus_mappings[best_idx]
    
    # Adjust score by weight of matching variant
    adjusted_score = best_score * weight
    
    matched = adjusted_score >= threshold
    
    response = {
        "matched": matched,
        "query": query,
        "matched_trade": matched_trade,
        "similarity_score": best_score,
        "adjusted_score": adjusted_score,
        "corpus_match": corpus_texts[best_idx]
    }
    
    if not matched:
        # Log fallback case
        msg = f"FALLBACK - Query: \"{query}\" | Best candidate: \"{matched_trade}\" ({corpus_texts[best_idx]}) | Score: {best_score:.4f} (Adjusted: {adjusted_score:.4f})"
        fallback_logger.warning(msg)
        logger.warning(msg)
        
    return jsonify(response)

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "model": "all-MiniLM-L6-v2", "corpus_size": len(corpus_texts)})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8091))
    logger.info(f"Starting NLU server on port {port}...")
    app.run(host="0.0.0.0", port=port)
