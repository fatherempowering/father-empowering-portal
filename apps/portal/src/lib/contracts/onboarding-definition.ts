/** Fixed V1 intake migrated from Max's public Tally form 44zdvk (2026-09-22).
 * This is not a runtime form builder. No third-party form code or submissions are embedded.
 */
export type OnboardingQuestionKey = "fullName" | "email" | "phoneNumber" | "age" | "height" | "currentBodyweight" | "whyNow" | "hundredDayGoals" | "noLongerTolerate" | "lifeChanges" | "fatherVision" | "commitmentScore" | "commitmentReason" | "trainingYears" | "currentTrainingDays" | "currentTrainingType" | "trainingWorked" | "trainingNotWorked" | "trainingLocations" | "availableEquipment" | "realisticTrainingDays" | "availableDays" | "workSchedule" | "preferredTrainingTime" | "doesCardio" | "cardioDetails" | "hadCoach" | "coachExperience" | "currentInjuries" | "pastInjuriesSurgeries" | "exercisesToAvoid" | "enjoyedExercises" | "mobilityRating" | "recoveryRating" | "sleepHours" | "sleepQuality" | "stressLevel" | "stressSources" | "medications" | "supplements" | "healthNotes" | "breakfast" | "lunch" | "dinner" | "snacks" | "mealsPerDay" | "waterIntake" | "alcoholFrequency" | "takeoutFrequency" | "nutritionStruggle" | "nutritionDifficultTimes" | "trackedMacros" | "trackingExperience" | "allergiesDigestion" | "refusedFoods" | "nutritionSuccess" | "nutritionPriority" | "biggestObstacle" | "offTrackCauses" | "supportNeeded" | "additionalNotes" | "protocolCommitment" | "confidenceScore" | "confidenceReason";
export type OnboardingCopy = Readonly<{ fr: string; en: string }>;
export type OnboardingQuestion = Readonly<{
  key: OnboardingQuestionKey;
  sourceId: string;
  label: OnboardingCopy;
  type: "text" | "email" | "tel" | "number" | "textarea" | "scale" | "single" | "multi";
  required: boolean;
  options?: readonly Readonly<{ value: string; label: OnboardingCopy }>[];
  min?: number; max?: number; step?: number; maxLength?: number;
  helper?: OnboardingCopy;
}>;
export type OnboardingSection = Readonly<{ id: string; title: OnboardingCopy; description: OnboardingCopy; questions: readonly OnboardingQuestion[] }>;

export const ONBOARDING_SECTIONS: readonly OnboardingSection[] = [
  {
    "id": "personal",
    "title": {
      "fr": "Informations personnelles",
      "en": "Personal Information"
    },
    "description": {
      "fr": "Bienvenue. Ce questionnaire permet à Max de mieux te connaître et de préparer ton Legacy Protocol personnalisé. Réponds avec honnêteté et précision, sans chercher à impressionner. L’objectif n’est pas la perfection : c’est la précision.",
      "en": "Welcome. This intake allows Max to get to know you and build your personalized Legacy Protocol. Be honest. Be accurate. Do not try to impress. The goal is not perfection. The goal is precision."
    },
    "questions": [
      {
        "key": "fullName",
        "sourceId": "300b2e20-3f19-4c83-8fa7-8c3fbc47bca7",
        "label": {
          "fr": "Nom complet",
          "en": "Full Name"
        },
        "type": "text",
        "required": true,
        "maxLength": 241
      },
      {
        "key": "email",
        "sourceId": "b0b4af26-f613-4a5c-bd2a-e57ad0e6af26",
        "label": {
          "fr": "Courriel",
          "en": "Email"
        },
        "type": "email",
        "required": true,
        "maxLength": 320,
        "helper": {
          "fr": "Ce courriel fait partie de tes réponses. Le modifier ici ne change pas ton adresse de connexion.",
          "en": "This email is part of your answers. Changing it here does not change your sign-in email."
        }
      },
      {
        "key": "phoneNumber",
        "sourceId": "f61884a5-b966-4e46-bf6b-506cb7562615",
        "label": {
          "fr": "Numéro de téléphone",
          "en": "Phone Number"
        },
        "type": "tel",
        "required": true,
        "maxLength": 40,
        "helper": {
          "fr": "Inclus l’indicatif du pays, par exemple +1.",
          "en": "Include your country code, for example +1."
        }
      },
      {
        "key": "age",
        "sourceId": "c1bd7a6e-2aad-40ea-b09e-b874258a91ab",
        "label": {
          "fr": "Âge",
          "en": "Age"
        },
        "type": "text",
        "required": true,
        "maxLength": 120
      },
      {
        "key": "height",
        "sourceId": "8e6b6b84-05ba-431c-975c-3498fdee5154",
        "label": {
          "fr": "Taille",
          "en": "Height"
        },
        "type": "text",
        "required": true,
        "maxLength": 120,
        "helper": {
          "fr": "Précise l’unité, par exemple 180 cm ou 5 pi 10 po.",
          "en": "Include the unit, for example 180 cm or 5 ft 10 in."
        }
      },
      {
        "key": "currentBodyweight",
        "sourceId": "d9b4fda3-0df9-4fef-b887-6cb4465c5c14",
        "label": {
          "fr": "Poids actuel",
          "en": "Current Bodyweight"
        },
        "type": "text",
        "required": true,
        "maxLength": 120,
        "helper": {
          "fr": "Précise l’unité, par exemple 185 lb ou 84 kg. Cette réponse ne remplace pas les mesures du bilan initial.",
          "en": "Include the unit, for example 185 lb or 84 kg. This answer does not replace your initial assessment measurements."
        }
      }
    ]
  },
  {
    "id": "vision",
    "title": {
      "fr": "Objectifs et vision",
      "en": "Objectives & Vision"
    },
    "description": {
      "fr": "Prends quelques minutes pour répondre honnêtement. Tes réponses donnent une direction à ton Legacy Protocol et définissent le cap des 100 prochains jours.",
      "en": "Take a few minutes to answer honestly. These answers help shape the direction of your Legacy Protocol and establish the standard for the next 100 days."
    },
    "questions": [
      {
        "key": "whyNow",
        "sourceId": "9ee23f41-ff58-43f2-a935-1b8f55f59684",
        "label": {
          "fr": "Pourquoi commences-tu maintenant ?",
          "en": "Why are you starting now?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "hundredDayGoals",
        "sourceId": "d0f39c7b-3180-4bc0-a625-1e46445bfa62",
        "label": {
          "fr": "Que veux-tu accomplir dans les 100 prochains jours ?",
          "en": "What do you want to achieve in the next 100 days?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "noLongerTolerate",
        "sourceId": "d54f6e07-91df-4a7a-b581-febd0785a59b",
        "label": {
          "fr": "Qu’est-ce que tu n’es plus prêt à tolérer ?",
          "en": "What are you no longer willing to tolerate?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "lifeChanges",
        "sourceId": "f4715c3c-8446-4d19-b45a-7178f68fb368",
        "label": {
          "fr": "Si ce programme est une réussite, qu’est-ce qui change dans ta vie ?",
          "en": "If this program is successful, what changes in your life?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "fatherVision",
        "sourceId": "4ac36aae-c522-4153-8d57-0290248252f5",
        "label": {
          "fr": "Quel père et quel homme veux-tu devenir ?",
          "en": "What kind of father and man do you want to become?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "commitmentScore",
        "sourceId": "1468f1f6-942c-4b99-92c1-71af6533e057",
        "label": {
          "fr": "Sur une échelle de 1 à 10, à quel point es-tu engagé dans cette transformation ?",
          "en": "On a scale from 1-10, how committed are you to this transformation?"
        },
        "type": "scale",
        "required": true,
        "min": 1,
        "max": 10,
        "step": 1
      },
      {
        "key": "commitmentReason",
        "sourceId": "9ffaea74-6d50-4105-b52c-cf73915de07e",
        "label": {
          "fr": "Pourquoi as-tu choisi ce chiffre ?",
          "en": "Why did you choose that number?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      }
    ]
  },
  {
    "id": "training",
    "title": {
      "fr": "Entraînement et équipement",
      "en": "Training History & Equipment"
    },
    "description": {
      "fr": "Ton expérience, ton équipement et ton horaire aideront Max à préparer un programme réaliste et efficace.",
      "en": "The goal of this section is to understand your training background, available equipment, and schedule so Max can build a realistic and effective program."
    },
    "questions": [
      {
        "key": "trainingYears",
        "sourceId": "b1d8908e-ffc9-4642-b9a6-2db39ea6b384",
        "label": {
          "fr": "Depuis combien d’années t’entraînes-tu régulièrement ?",
          "en": "How many years have you been training consistently?"
        },
        "type": "number",
        "required": true,
        "min": 0,
        "max": 100
      },
      {
        "key": "currentTrainingDays",
        "sourceId": "681c37d8-c720-4691-ab28-cdd92f38686b",
        "label": {
          "fr": "Combien de jours par semaine t’entraînes-tu actuellement ?",
          "en": "How many days per week are you currently training?"
        },
        "type": "number",
        "required": true,
        "min": 0,
        "max": 7,
        "step": 1
      },
      {
        "key": "currentTrainingType",
        "sourceId": "1021ca32-a742-49cc-9e28-71f39e487d5e",
        "label": {
          "fr": "Quel type d’entraînement fais-tu actuellement ?",
          "en": "What type of training are you currently doing?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "trainingWorked",
        "sourceId": "adeea88a-da25-4778-ba0c-22443e7f2862",
        "label": {
          "fr": "Qu’est-ce qui a bien fonctionné pour toi dans le passé ?",
          "en": "What has worked well for you in the past?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "trainingNotWorked",
        "sourceId": "57f416f2-f84a-450e-970c-b4385ece99df",
        "label": {
          "fr": "Qu’est-ce qui n’a PAS bien fonctionné pour toi dans le passé ?",
          "en": "What has NOT worked well for you in the past?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "trainingLocations",
        "sourceId": "7eb7a5e2-a19f-450d-8cff-6ee7effaddc4",
        "label": {
          "fr": "Où t’entraîneras-tu le plus souvent ?",
          "en": "Where will you train most often?"
        },
        "type": "multi",
        "required": true,
        "options": [
          {
            "value": "COMMERCIAL_GYM",
            "label": {
              "fr": "Salle d’entraînement",
              "en": "Commercial Gym"
            }
          },
          {
            "value": "HOME_GYM",
            "label": {
              "fr": "À la maison",
              "en": "Home Gym"
            }
          },
          {
            "value": "BOTH",
            "label": {
              "fr": "Les deux",
              "en": "Both"
            }
          }
        ]
      },
      {
        "key": "availableEquipment",
        "sourceId": "573d631d-c701-4f16-a7c6-adbc5c7fa9a9",
        "label": {
          "fr": "Décris l’équipement dont tu disposes.",
          "en": "Describe the equipment you have available."
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500,
        "helper": {
          "fr": "Par exemple : salle complète, rack et haltères, ou bandes élastiques.",
          "en": "Examples:* Full commercial gym* Rack, barbell, dumbbells* Resistance bands only"
        }
      },
      {
        "key": "realisticTrainingDays",
        "sourceId": "a8f6631e-0006-42e7-8e76-b62248f72c2b",
        "label": {
          "fr": "Combien de jours par semaine peux-tu réellement t’entraîner ?",
          "en": "How many days per week can you realistically train?"
        },
        "type": "number",
        "required": true,
        "min": 0,
        "max": 7,
        "step": 1
      },
      {
        "key": "availableDays",
        "sourceId": "5147df57-fff3-4ace-aa57-c47fba4c6f87",
        "label": {
          "fr": "Quels jours sont généralement disponibles pour t’entraîner ?",
          "en": "What days are usually available for training?"
        },
        "type": "multi",
        "required": true,
        "options": [
          {
            "value": "MONDAY",
            "label": {
              "fr": "Lundi",
              "en": "Monday"
            }
          },
          {
            "value": "TUESDAY",
            "label": {
              "fr": "Mardi",
              "en": "Tuesday"
            }
          },
          {
            "value": "WEDNESDAY",
            "label": {
              "fr": "Mercredi",
              "en": "Wednesday"
            }
          },
          {
            "value": "THURSDAY",
            "label": {
              "fr": "Jeudi",
              "en": "Thursday"
            }
          },
          {
            "value": "FRIDAY",
            "label": {
              "fr": "Vendredi",
              "en": "Friday"
            }
          },
          {
            "value": "SATURDAY",
            "label": {
              "fr": "Samedi",
              "en": "Saturday"
            }
          },
          {
            "value": "SUNDAY",
            "label": {
              "fr": "Dimanche",
              "en": "Sunday"
            }
          }
        ]
      },
      {
        "key": "workSchedule",
        "sourceId": "45b37b5f-fa07-49e2-b40e-85a25a1ae363",
        "label": {
          "fr": "Quel est ton horaire de travail habituel ?",
          "en": "Typical work schedule"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500,
        "helper": {
          "fr": "Par exemple : construction de 6 h à 15 h, bureau de 8 h à 17 h, ou travail par quarts.",
          "en": "Example:Construction 6am-3pmOffice 8am-5pmShift work"
        }
      },
      {
        "key": "preferredTrainingTime",
        "sourceId": "581f21d8-1395-4186-9963-23aad5327e83",
        "label": {
          "fr": "À quel moment de la journée préfères-tu t’entraîner ?",
          "en": "What time of day do you prefer to train?"
        },
        "type": "single",
        "required": true,
        "options": [
          {
            "value": "EARLY_MORNING",
            "label": {
              "fr": "Tôt le matin",
              "en": "Early Morning"
            }
          },
          {
            "value": "MORNING",
            "label": {
              "fr": "Matin",
              "en": "Morning"
            }
          },
          {
            "value": "LUNCH",
            "label": {
              "fr": "Midi",
              "en": "Lunch"
            }
          },
          {
            "value": "AFTERNOON",
            "label": {
              "fr": "Après-midi",
              "en": "Afternoon"
            }
          },
          {
            "value": "EVENING",
            "label": {
              "fr": "Soir",
              "en": "Evening"
            }
          },
          {
            "value": "NO_PREFERENCE",
            "label": {
              "fr": "Aucune préférence",
              "en": "No Preference"
            }
          }
        ]
      },
      {
        "key": "doesCardio",
        "sourceId": "ec1c800a-81b9-4afd-8208-e581943a5e05",
        "label": {
          "fr": "Fais-tu actuellement du cardio ?",
          "en": "Do you currently do cardio?"
        },
        "type": "single",
        "required": true,
        "options": [
          {
            "value": "YES",
            "label": {
              "fr": "Oui",
              "en": "Yes"
            }
          },
          {
            "value": "NO",
            "label": {
              "fr": "Non",
              "en": "No"
            }
          }
        ]
      },
      {
        "key": "cardioDetails",
        "sourceId": "09bd4bb3-750e-4d35-96c1-700bc0b0b409",
        "label": {
          "fr": "Si oui, quel type de cardio et à quelle fréquence ?",
          "en": "If yes, what type and how often?"
        },
        "type": "textarea",
        "required": false,
        "maxLength": 1500
      },
      {
        "key": "hadCoach",
        "sourceId": "563def06-0835-421e-ad45-2202a940a3fb",
        "label": {
          "fr": "As-tu déjà travaillé avec un coach ?",
          "en": "Have you ever worked with a coach before?"
        },
        "type": "single",
        "required": true,
        "options": [
          {
            "value": "YES",
            "label": {
              "fr": "Oui",
              "en": "Yes"
            }
          },
          {
            "value": "NO",
            "label": {
              "fr": "Non",
              "en": "No"
            }
          }
        ]
      },
      {
        "key": "coachExperience",
        "sourceId": "b2e3c759-039b-4ee6-82aa-469356412ed4",
        "label": {
          "fr": "Si oui, qu’as-tu aimé et moins aimé dans cette expérience ?",
          "en": "If yes, what did you like and dislike about the experience?"
        },
        "type": "textarea",
        "required": false,
        "maxLength": 1500
      }
    ]
  },
  {
    "id": "health",
    "title": {
      "fr": "Santé et récupération",
      "en": "Injuries, Limitations & Recovery"
    },
    "description": {
      "fr": "Ces réponses aident Max à préparer un programme adapté à ton corps. Réponds honnêtement : l’objectif est de progresser, pas de prouver que tu es dur à cuire. Tu peux écrire « Rien à signaler » si c’est le cas.",
      "en": "This section helps Max build a program that works with your body, not against it. Be honest. The goal is progress, not proving how tough you are. You can write “Nothing to report” where that applies."
    },
    "questions": [
      {
        "key": "currentInjuries",
        "sourceId": "269e3bfc-3b3b-437f-bf0c-cea1b6077371",
        "label": {
          "fr": "As-tu actuellement des blessures, des douleurs ou des limitations physiques ?",
          "en": "Do you currently have any injuries, pain, or physical limitations?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "pastInjuriesSurgeries",
        "sourceId": "85d886a0-161e-4072-9df2-52825b093113",
        "label": {
          "fr": "As-tu eu des blessures importantes ou des opérations dans le passé ?",
          "en": "Have you had any significant injuries or surgeries in the past?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "exercisesToAvoid",
        "sourceId": "82463866-0195-4f06-ae00-a56776cbf411",
        "label": {
          "fr": "Y a-t-il des exercices que tu devrais éviter ?",
          "en": "Are there any exercises you should avoid?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "enjoyedExercises",
        "sourceId": "a4ab024e-e51f-410c-beaa-115e778f4daf",
        "label": {
          "fr": "Y a-t-il des exercices que tu aimes ou que tu te sens à l’aise de faire ?",
          "en": "Are there any exercises you enjoy or feel confident performing?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "mobilityRating",
        "sourceId": "f80032ce-4ca0-4eee-b4c6-b02e9ad0f18d",
        "label": {
          "fr": "Comment évalues-tu ta mobilité actuelle ?",
          "en": "How would you rate your current mobility?"
        },
        "type": "single",
        "required": true,
        "options": [
          {
            "value": "VERY_POOR",
            "label": {
              "fr": "Très faible",
              "en": "Very Poor"
            }
          },
          {
            "value": "POOR",
            "label": {
              "fr": "Faible",
              "en": "Poor"
            }
          },
          {
            "value": "AVERAGE",
            "label": {
              "fr": "Moyenne",
              "en": "Average"
            }
          },
          {
            "value": "GOOD",
            "label": {
              "fr": "Bonne",
              "en": "Good"
            }
          },
          {
            "value": "EXCELLENT",
            "label": {
              "fr": "Excellente",
              "en": "Excellent"
            }
          }
        ]
      },
      {
        "key": "recoveryRating",
        "sourceId": "89526dcd-076a-46e8-a281-02c23bbaf9a4",
        "label": {
          "fr": "Comment évalues-tu ta récupération entre les entraînements ?",
          "en": "How would you rate your current recovery between workouts?"
        },
        "type": "single",
        "required": true,
        "options": [
          {
            "value": "VERY_POOR",
            "label": {
              "fr": "Très faible",
              "en": "Very Poor"
            }
          },
          {
            "value": "POOR",
            "label": {
              "fr": "Faible",
              "en": "Poor"
            }
          },
          {
            "value": "AVERAGE",
            "label": {
              "fr": "Moyenne",
              "en": "Average"
            }
          },
          {
            "value": "GOOD",
            "label": {
              "fr": "Bonne",
              "en": "Good"
            }
          },
          {
            "value": "EXCELLENT",
            "label": {
              "fr": "Excellente",
              "en": "Excellent"
            }
          },
          {
            "value": "DONT_KNOW",
            "label": {
              "fr": "Je ne sais pas",
              "en": "Don't Know"
            }
          }
        ]
      },
      {
        "key": "sleepHours",
        "sourceId": "38d319a4-307d-4946-aa35-83fd5de1ee28",
        "label": {
          "fr": "Combien d’heures dors-tu en moyenne par nuit ?",
          "en": "Average hours of sleep per night"
        },
        "type": "number",
        "required": true,
        "min": 0,
        "max": 24
      },
      {
        "key": "sleepQuality",
        "sourceId": "93cdc528-886b-4609-b379-09bb1c6b459d",
        "label": {
          "fr": "Comment évalues-tu la qualité de ton sommeil ?",
          "en": "How would you rate your sleep quality?"
        },
        "type": "scale",
        "required": true,
        "min": 0,
        "max": 10,
        "step": 1
      },
      {
        "key": "stressLevel",
        "sourceId": "7277af82-6213-4033-b8a3-9321ebbe1a11",
        "label": {
          "fr": "Comment évalues-tu ton niveau de stress quotidien ?",
          "en": "How would you rate your daily stress level?"
        },
        "type": "scale",
        "required": true,
        "min": 0,
        "max": 10,
        "step": 1
      },
      {
        "key": "stressSources",
        "sourceId": "1f077c95-3d88-4cdc-a570-f4be57e6c80f",
        "label": {
          "fr": "Qu’est-ce qui te cause le plus de stress actuellement ?",
          "en": "What currently creates the most stress in your life?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "medications",
        "sourceId": "af97313e-5622-421a-91a0-b1e6dc43693c",
        "label": {
          "fr": "Prends-tu actuellement des médicaments ?",
          "en": "Do you currently take any medications?"
        },
        "type": "textarea",
        "required": false,
        "maxLength": 1500
      },
      {
        "key": "supplements",
        "sourceId": "8e188053-404b-48e7-96e4-0b7f46db35ff",
        "label": {
          "fr": "Prends-tu actuellement des suppléments ?",
          "en": "Do you currently take any supplements?"
        },
        "type": "textarea",
        "required": false,
        "maxLength": 1500
      },
      {
        "key": "healthNotes",
        "sourceId": "7e65448a-e191-4187-b83d-fa2d8c2b259d",
        "label": {
          "fr": "Y a-t-il quelque chose concernant ta santé que Max devrait savoir avant de préparer ton protocole ?",
          "en": "Is there anything about your health that Max should know before building your protocol?"
        },
        "type": "textarea",
        "required": false,
        "maxLength": 1500
      }
    ]
  },
  {
    "id": "nutrition",
    "title": {
      "fr": "Habitudes alimentaires",
      "en": "Nutrition Assessment"
    },
    "description": {
      "fr": "Il n’existe pas d’alimentation parfaite. Max veut comprendre tes habitudes pour préparer une stratégie adaptée à ta vie. L’honnêteté et la précision passent avant la perfection.",
      "en": "There is no perfect diet. The goal of this section is to understand your current habits so Max can build a nutrition strategy that fits your life. Be honest. Accuracy beats perfection."
    },
    "questions": [
      {
        "key": "breakfast",
        "sourceId": "ad858df2-4127-4ea4-bda5-4e6d71611c7a",
        "label": {
          "fr": "Décris ton déjeuner habituel.",
          "en": "Describe a typical breakfast."
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "lunch",
        "sourceId": "04460ef6-b359-4fd4-a95a-8d9b9806e0c2",
        "label": {
          "fr": "Décris ton dîner habituel.",
          "en": "Describe a typical lunch."
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "dinner",
        "sourceId": "80730324-736c-4068-a52c-6bfff2f06d7a",
        "label": {
          "fr": "Décris ton souper habituel.",
          "en": "Describe a typical dinner."
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "snacks",
        "sourceId": "0a296666-eba6-486e-bf38-cb276133cb32",
        "label": {
          "fr": "Quelles collations prends-tu habituellement pendant la journée ?",
          "en": "Typical snacks throughout the day."
        },
        "type": "textarea",
        "required": false,
        "maxLength": 1500
      },
      {
        "key": "mealsPerDay",
        "sourceId": "6ffdfed7-a840-4aae-a104-acbfdbf2cf14",
        "label": {
          "fr": "Combien de repas prends-tu habituellement par jour ?",
          "en": "How many meals do you usually eat per day?"
        },
        "type": "number",
        "required": true,
        "min": 0,
        "max": 24,
        "step": 1
      },
      {
        "key": "waterIntake",
        "sourceId": "5a150c87-5adc-46a2-9428-0a1cab42b377",
        "label": {
          "fr": "Quelle quantité d’eau bois-tu environ par jour ?",
          "en": "Estimated daily water intake."
        },
        "type": "text",
        "required": true,
        "maxLength": 120,
        "helper": {
          "fr": "Par exemple : 2 L par jour.",
          "en": "For example: 2 L per day."
        }
      },
      {
        "key": "alcoholFrequency",
        "sourceId": "db329455-a848-40d1-80a0-51fb40fe6799",
        "label": {
          "fr": "À quelle fréquence consommes-tu de l’alcool ?",
          "en": "How often do you consume alcohol?"
        },
        "type": "single",
        "required": true,
        "options": [
          {
            "value": "NEVER",
            "label": {
              "fr": "Jamais",
              "en": "Never"
            }
          },
          {
            "value": "RARELY",
            "label": {
              "fr": "Rarement",
              "en": "Rarely"
            }
          },
          {
            "value": "1_2_TIMES_PER_WEEK",
            "label": {
              "fr": "1 à 2 fois par semaine",
              "en": "1-2 times per week"
            }
          },
          {
            "value": "3_4_TIMES_PER_WEEK",
            "label": {
              "fr": "3 à 4 fois par semaine",
              "en": "3-4 times per week"
            }
          },
          {
            "value": "5_PLUS_TIMES_PER_WEEK",
            "label": {
              "fr": "5 fois par semaine ou plus",
              "en": "5+ times per week"
            }
          }
        ]
      },
      {
        "key": "takeoutFrequency",
        "sourceId": "8d588bc7-ba51-4b42-b61d-c7ea2d9aa040",
        "label": {
          "fr": "À quelle fréquence manges-tu au restaurant ou commandes-tu des repas ?",
          "en": "How often do you eat restaurant or takeout meals?"
        },
        "type": "single",
        "required": true,
        "options": [
          {
            "value": "RARELY",
            "label": {
              "fr": "Rarement",
              "en": "Rarely"
            }
          },
          {
            "value": "1_2_TIMES_PER_WEEK",
            "label": {
              "fr": "1 à 2 fois par semaine",
              "en": "1-2 times per week"
            }
          },
          {
            "value": "3_4_TIMES_PER_WEEK",
            "label": {
              "fr": "3 à 4 fois par semaine",
              "en": "3-4 times per week"
            }
          },
          {
            "value": "5_PLUS_TIMES_PER_WEEK",
            "label": {
              "fr": "5 fois par semaine ou plus",
              "en": "5+ times per week"
            }
          }
        ]
      },
      {
        "key": "nutritionStruggle",
        "sourceId": "3af7f187-6e92-4cb6-b785-be74a870469a",
        "label": {
          "fr": "Quelle est ta plus grande difficulté avec l’alimentation ?",
          "en": "What is your biggest nutrition struggle?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "nutritionDifficultTimes",
        "sourceId": "39899c98-9d2f-4809-9916-44e4d6cf598b",
        "label": {
          "fr": "À quels moments as-tu le plus de difficulté avec ton alimentation ?",
          "en": "What time of day do you struggle the most with nutrition?"
        },
        "type": "multi",
        "required": true,
        "options": [
          {
            "value": "MORNING",
            "label": {
              "fr": "Matin",
              "en": "Morning"
            }
          },
          {
            "value": "MID_MORNING",
            "label": {
              "fr": "Avant-midi",
              "en": "Mid-Morning"
            }
          },
          {
            "value": "AFTERNOON",
            "label": {
              "fr": "Après-midi",
              "en": "Afternoon"
            }
          },
          {
            "value": "EVENING",
            "label": {
              "fr": "Soir",
              "en": "Evening"
            }
          },
          {
            "value": "LATE_NIGHT",
            "label": {
              "fr": "Tard le soir",
              "en": "Late Night"
            }
          },
          {
            "value": "WEEKENDS",
            "label": {
              "fr": "Fins de semaine",
              "en": "Weekends"
            }
          }
        ]
      },
      {
        "key": "trackedMacros",
        "sourceId": "e4e6ea7f-10e9-4d5a-8390-2d882569fdd3",
        "label": {
          "fr": "As-tu déjà suivi tes calories ou tes macros ?",
          "en": "Have you ever tracked calories or macros?"
        },
        "type": "single",
        "required": true,
        "options": [
          {
            "value": "YES",
            "label": {
              "fr": "Oui",
              "en": "Yes"
            }
          },
          {
            "value": "NO",
            "label": {
              "fr": "Non",
              "en": "No"
            }
          }
        ]
      },
      {
        "key": "trackingExperience",
        "sourceId": "6b83e175-124b-4340-898d-705f4a437a4c",
        "label": {
          "fr": "Si oui, qu’est-ce qui a fonctionné ou non ?",
          "en": "If yes, what worked and what did not work?"
        },
        "type": "textarea",
        "required": false,
        "maxLength": 1500
      },
      {
        "key": "allergiesDigestion",
        "sourceId": "68d47dd2-fc97-4ff0-ba90-29be0f4b783e",
        "label": {
          "fr": "As-tu des allergies alimentaires, des intolérances ou des problèmes digestifs ?",
          "en": "Do you have any food allergies, intolerances, or digestive issues?"
        },
        "type": "textarea",
        "required": false,
        "maxLength": 1500
      },
      {
        "key": "refusedFoods",
        "sourceId": "64ea29cc-5514-44f2-9540-295bc70c1f00",
        "label": {
          "fr": "Y a-t-il des aliments que tu refuses absolument de manger ?",
          "en": "Are there foods you absolutely refuse to eat?"
        },
        "type": "textarea",
        "required": false,
        "maxLength": 1500
      },
      {
        "key": "nutritionSuccess",
        "sourceId": "d9580d1d-ba6b-406a-9bae-77b174a36205",
        "label": {
          "fr": "À quoi ressemblerait une réussite sur le plan alimentaire pour toi ?",
          "en": "What would success with nutrition look like for you?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "nutritionPriority",
        "sourceId": "4bb1c9df-0aec-422b-bb87-21b6875f232e",
        "label": {
          "fr": "Si tu pouvais améliorer immédiatement une seule chose dans ton alimentation, laquelle choisirais-tu ?",
          "en": "If you could fix one thing about your nutrition immediately, what would it be?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      }
    ]
  },
  {
    "id": "commitment",
    "title": {
      "fr": "Soutien et engagement",
      "en": "Final Notes & Commitment"
    },
    "description": {
      "fr": "Tu y es presque. Prends un moment pour répondre. Le Legacy Protocol repose sur l’honnêteté, la constance et l’action, plutôt que sur la perfection.",
      "en": "You are almost done. Take a moment before answering. The Legacy Protocol works when honesty, consistency, and execution replace perfection."
    },
    "questions": [
      {
        "key": "biggestObstacle",
        "sourceId": "1ae6f1e0-7435-4c9b-9751-9a5b805f0e00",
        "label": {
          "fr": "Quel sera, selon toi, ton plus grand obstacle au cours des 100 prochains jours ?",
          "en": "What do you believe will be your biggest obstacle during the next 100 days?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "offTrackCauses",
        "sourceId": "43e15eaf-4997-44dd-be04-f2f7562a19ba",
        "label": {
          "fr": "Qu’est-ce qui te fait habituellement perdre le fil ?",
          "en": "What usually causes you to fall off track?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "supportNeeded",
        "sourceId": "2ebac3b0-83b3-4d12-bf97-dd068c2ed2f4",
        "label": {
          "fr": "De quel soutien as-tu le plus besoin de la part de Max ?",
          "en": "What support do you need most from Max?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      },
      {
        "key": "additionalNotes",
        "sourceId": "7ae65a07-86f6-4947-823a-f427e6ca9dc3",
        "label": {
          "fr": "Y a-t-il autre chose que Max devrait savoir avant de préparer ton protocole personnalisé ?",
          "en": "Is there anything else Max should know before building your personalized protocol?"
        },
        "type": "textarea",
        "required": false,
        "maxLength": 1500
      },
      {
        "key": "protocolCommitment",
        "sourceId": "7a4adeb3-e79b-4178-a635-f413d5e37dd2",
        "label": {
          "fr": "Je m’engage dans le protocole.",
          "en": "I commit to the protocol."
        },
        "type": "single",
        "required": true,
        "options": [
          {
            "value": "YES",
            "label": {
              "fr": "Oui",
              "en": "Yes"
            }
          }
        ],
        "helper": {
          "fr": "Je comprends que les résultats viennent d’actions constantes. Je m’engage à être honnête, à communiquer au besoin et à suivre le processus du mieux que je peux. L’objectif est de progresser, pas d’être parfait.",
          "en": "I understand that results come from consistent execution. I commit to showing up honestly, communicating when needed, and following the process to the best of my ability. The goal is progress, not perfection."
        }
      },
      {
        "key": "confidenceScore",
        "sourceId": "329b4851-a3c6-4c17-be19-bd2ce16c938a",
        "label": {
          "fr": "Sur une échelle de 1 à 10, à quel point es-tu confiant de pouvoir réussir les 100 prochains jours ?",
          "en": "On a scale from 1-10, how confident are you that you can successfully complete the next 100 days?"
        },
        "type": "scale",
        "required": true,
        "min": 1,
        "max": 10,
        "step": 1
      },
      {
        "key": "confidenceReason",
        "sourceId": "9f45b1e5-baac-4d68-8cbe-8d78de5f10ba",
        "label": {
          "fr": "Pourquoi ?",
          "en": "Why?"
        },
        "type": "textarea",
        "required": true,
        "maxLength": 1500
      }
    ]
  }
];

export const ONBOARDING_QUESTIONS: readonly OnboardingQuestion[] = ONBOARDING_SECTIONS.flatMap((section) => section.questions);
