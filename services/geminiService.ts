import { GoogleGenerativeAI } from "@google/generative-ai";
import { VehicleAnalysis, ScanType } from "../types";

// Configuration de l'API Gemini avec le SDK officiel
const getAIClient = () => {
  // Tentative de récupération flexible (Standard Vite ou Node process)
  const apiKey = import.meta.env.VITE_API_KEY || process.env.API_KEY;

  if (!apiKey) {
    console.error("DEBUG: API Key manquante. VITE_API_KEY:", !!import.meta.env.VITE_API_KEY, "process.env.API_KEY:", !!process.env.API_KEY);
    throw new Error("Clé API Google Gemini manquante. Veuillez ajouter VITE_API_KEY dans Vercel.");
  }
  return new GoogleGenerativeAI(apiKey);
};

// Fonction utilitaire pour nettoyer le JSON retourné par l'IA
const cleanJson = (text: string): any => {
  try {
    // Enlever les balises Markdown ```json et ```
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Erreur de parsing JSON:", error);
    throw new Error("IA_JSON_ERROR: La réponse de l'IA n'est pas un JSON valide.");
  }
};

/**
 * Analyse un véhicule uniquement via son numéro VIN textuel.
 */
export const analyzeVehicleByVin = async (vin: string): Promise<Partial<VehicleAnalysis>> => {
  const genAI = getAIClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Tu es KHABIR, expert automobile certifié au Maroc. 
       À partir de ce numéro VIN : ${vin}, effectue un décodage ISO 3779 rigoureux.
       
       RÈGLES D'IDENTIFICATION :
       1. Examine le VDS (caractères 4 à 9). Pour le groupe VAG (Audi, VW, Seat), les positions 7 et 8 sont critiques pour le code modèle (ex: 8X=A1, F5=A5, 5F=Leon, 51=Ateca).
       2. Ne confonds pas les segments. Si les positions 7-8 indiquent '5F', le modèle est 'LEON', pas 'ATECA'.
       3. Croise avec le marché MAROCAIN (importateurs officiels comme CAC, Sopriam, Renault Commerce Maroc).
       
       CHAMPS REQUIS :
       - brand : Constructeur.
       - model : Modèle commercial exact au Maroc.
       - deductionReasoning : Explique précisément quel code VDS (positions 4-9) ou VIS a permis d'identifier le modèle (ex: "Identifié comme Audi A1 grâce au code VDS '8X' en positions 7-8").
       - yearOfManufacture : Année code (Position 10).
       - motorization : Motorisation standard au Maroc.
       - fuelType : ["Essence", "Diesel", "Hybride", "Électrique", "N/A"].
       - color : Couleur probable.
       
       Réponds uniquement en JSON pur, sans texte autour.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return cleanJson(text);
  } catch (error) {
    console.error("Erreur analyzeVehicleByVin:", error);
    return {};
  }
};

/**
 * Analyse critique d'une image (Photo VIN ou Carte Grise)
 */
export const analyzeVehicleCritical = async (
  base64Image: string,
  mode: ScanType = 'vin'
): Promise<Partial<VehicleAnalysis>> => {
  const genAI = getAIClient();
  // Utilisation de gemini-1.5-flash, optimisé pour la vitesse et la vision
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" } // Force le mode JSON natif
  });

  const prompt = `Tu es KHABIR, expert extraction documentaire automobile au Maroc.
       Ta mission est d'extraire le VIN (Numéro de Châssis) et les infos clés de l'image.
       
       RÈGLES CRITIQUES (ISO 3779 & NM ISO 3779 Maroc) :
       1. PRIORITÉ ABSOLUE : Trouver le VIN de 17 caractères (0-9, A-Z sauf I, O, Q).
       2. SI IMAGE = CARTE GRISE : Extrais DIRECTEMENT la Marque, le Modèle, le Carburant, et l'Immatriculation du texte imprimé.
       3. SI IMAGE = VIN SEUL : Corrige l'OCR (I=1, O=0, B=8, S=5, Z=2). Le VIN prime.
       
       ANALYSE DU VÉHICULE (DÉDUCTION) :
       - Code WMI (3 chars) -> Marque.
       - Code VDS (chars 4-9) -> Modèle/Moteur.
       - Code Année (char 10) -> Année Fabrication.
       
       EXTRAIRE (JSON) :
       - brand : Marque (ex: MERCEDES-BENZ, MG, AUDI).
       - model : Modèle commercial (ex: GLC 220d, GOLF 8).
       - vin : Le VIN normalisé de 17 caractères.
       - deductionReasoning : Justification courte.
       - yearOfManufacture : Année déduite.
       - licensePlate : Immatriculation.
       - registrationYear : Année mise en circulation.
       
       Format JSON attendu uniquement.`;

  try {
    // Préparation de l'image pour l'API
    // Note: Le SDK officiel attend base64 sans header ou un objet Part spécifique
    const imagePart = {
      inlineData: {
        data: base64Image.split(',')[1] || base64Image,
        mimeType: "image/jpeg",
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();
    const rawData = cleanJson(text);

    return {
      vin: String(rawData.vin || "").replace(/[^A-Z0-9]/gi, '').toUpperCase(),
      brand: String(rawData.brand || "Inconnu").toUpperCase(),
      model: String(rawData.model || "ANALYSE...").toUpperCase(),
      deductionReasoning: rawData.deductionReasoning || "",
      yearOfManufacture: String(rawData.yearOfManufacture || "N/A"),
      licensePlate: String(rawData.licensePlate || ""),
      registrationYear: String(rawData.registrationYear || "")
    };

  } catch (error: any) {
    console.error("Erreur analyzeVehicleCritical:", error);
    if (error.message?.includes('API_KEY')) throw new Error("CLÉ API INVALIDE");
    throw new Error("IA_ANALYSIS_FAILED: " + (error.message || "Erreur inconnue"));
  }
};

export const analyzeVehicleDetails = async (
  base64Image: string,
  brand: string
): Promise<Partial<VehicleAnalysis>> => {
  const genAI = getAIClient();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" }
  });

  const prompt = `Expert automobile spécialiste du marché MAROCAIN (KABIR).
       À partir de cette image et sachant que la marque est ${brand}, affine l'analyse.
       
       CONTEXTE MARCHÉ MAROC :
       - Motorisations spécifiques (1.5 dCi, 2.0 TDI...).
       - Importateurs (CAC, Sopriam, Auto Nejma...).
       
       CHAMPS À AFFINER (JSON) :
       - model : Version/finition exacte.
       - motorization : Déduction logique.
       - fuelType : ["Essence", "Diesel", "Hybride", "Électrique", "N/A"].
       - color : Nom commercial.
       - registrationYear : Année mise en circulation.
       - deductionReasoning : Explication.`;

  try {
    const imagePart = {
      inlineData: {
        data: base64Image.split(',')[1] || base64Image,
        mimeType: "image/jpeg",
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();
    return cleanJson(text);
  } catch (error) {
    console.error("Erreur analyzeVehicleDetails:", error);
    return {};
  }
};

/**
 * Génère un rapport d'expertise détaillé à partir d'un VIN.
 */
export const getVinAnalysisReport = async (vin: string): Promise<string> => {
  const genAI = getAIClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Tu es KHABIR, expert automobile officiel au Maroc.
       Rédige un rapport d'expertise technique pour le VIN : ${vin}.
       
       STRUCTURE DU RAPPORT (Markdown) :
       ### 1. 🚘 Identité & Conformité
       - **Marque/Modèle** : [Nom]
       - **Origine** : [Pays détecté via WMI]
       - **Importateur Maroc** : (Citer l'importateur officiel local)
       
       ### 2. ⚙️ Analyse Technique (Déduction VIN)
       - **Moteur** : [Déduction via VDS]
       - **Année Modèle** : [Déduction via 10ème caractère]
       - *Note : Cette analyse respecte la norme NM ISO 3779.*
       
       ### 3. 🔍 Décodage Détaillé
       | Section | Code | Signification |
       | :--- | :--- | :--- |
       | **WMI** | ${vin.substring(0, 3)} | Constructeur / Pays |
       | **VDS** | ${vin.substring(3, 9)} | Caractéristiques |
       | **VIS** | ${vin.substring(9, 17)} | Identification Unique |
       
       ### 4. ⚠️ Points de Vigilance
       - Lister 2-3 points à surveiller sur ce modèle.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Erreur Report:", error);
    return "Impossible de générer le rapport. Vérifiez la connexion ou le VIN.";
  }
};

export const chatWithExpert = async (history: any[], question: string): Promise<string> => {
  const genAI = getAIClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const chat = model.startChat({
    history: history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.parts[0].text }]
    })),
    systemInstruction: "Tu es KHABIR, expert automobile marocain."
  });

  try {
    const result = await chat.sendMessage(question);
    const response = await result.response;
    return response.text();
  } catch (e) {
    return "Service de chat temporairement indisponible.";
  }
};

export const estimateMarketValue = async (vehicle: VehicleAnalysis): Promise<Partial<VehicleAnalysis>> => {
  // Implémentation simplifiée pour éviter les erreurs de type
  return {
    marketValueMin: 0,
    marketValueMax: 0
  };
};
