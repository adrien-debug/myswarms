-- 0012_personal_swarm_templates.sql
--
-- Insère 3 swarms templates prêts à l'emploi (owner_id = NULL, is_template = true).
-- Lisibles par tout utilisateur authentifié (policy "swarms_templates_readable" de 0006).
-- Idempotent : ON CONFLICT DO NOTHING sur tous les inserts.
-- UUIDs fixes (pattern prévisible) pour éviter tout doublon sur re-run.

-- =====================================================================
-- Template A — Market Intelligence Scout
-- aaaaaaaa-0001-*
-- =====================================================================

INSERT INTO public.swarms (id, owner_id, name, description, version, config_json, is_active, is_template)
VALUES (
  'aaaaaaaa-0001-0001-0001-000000000001',
  NULL,
  'Market Intelligence Scout',
  'Scrute les concurrents, l''actualité sectorielle et les signaux stratégiques chaque matin. Produit 5 bullets + 1 signal clé.',
  1,
  '{"target_urls": [], "keywords": [], "telegram_on_signal": true, "scheduled_trigger": "morning"}',
  true,
  true
) ON CONFLICT (id) DO NOTHING;

-- Agents Template A
INSERT INTO public.swarm_agents (id, swarm_id, name, role, system_prompt, model_provider, model_name, temperature, position_x, position_y)
VALUES
  (
    'bbbbbbbb-0001-0001-0001-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000001',
    'Web Scraper',
    'executor',
    'Tu es un agent spécialisé dans l''extraction de contenu web. Tu accèdes aux URLs cibles, collectes les titres, résumés et dates de publication des articles récents. Tu retournes uniquement les données brutes structurées sans interprétation.',
    'anthropic',
    'claude-haiku-4-5-20251001',
    0.1,
    100, 100
  ),
  (
    'bbbbbbbb-0001-0002-0002-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000001',
    'Search Analyst',
    'tool_runner',
    'Tu effectues des recherches web ciblées sur les mots-clés sectoriels et concurrentiels fournis. Tu identifies les tendances émergentes et les mouvements de marché significatifs des dernières 24h.',
    'anthropic',
    'claude-sonnet-4-6',
    0.3,
    100, 250
  ),
  (
    'bbbbbbbb-0001-0003-0003-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000001',
    'Intelligence Synthesizer',
    'analyst',
    'Tu analyses l''ensemble des données collectées par le scraper et le moteur de recherche. Tu identifies les 5 informations les plus stratégiques et le signal clé de la journée. Tu produis un brief concis orienté décision.',
    'anthropic',
    'claude-sonnet-4-6',
    0.4,
    300, 175
  ),
  (
    'bbbbbbbb-0001-0004-0004-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000001',
    'Alert Dispatcher',
    'executor',
    'Tu envoies le digest final via Telegram et génères les alertes prioritaires si un signal critique est détecté. Tu formules les messages de façon synthétique et actionnable.',
    'anthropic',
    'claude-haiku-4-5-20251001',
    0.2,
    500, 175
  )
ON CONFLICT (id) DO NOTHING;

-- Tasks Template A (séquentielles)
INSERT INTO public.swarm_tasks (id, swarm_id, agent_id, name, description, expected_output, depends_on_task_id, position_x, position_y)
VALUES
  (
    'cccccccc-0001-0001-0001-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000001',
    'bbbbbbbb-0001-0001-0001-000000000001',
    'Scrape Target URLs',
    'Accéder aux URLs configurées dans config_json.target_urls et extraire le contenu des articles/posts publiés dans les dernières 24h.',
    'Liste structurée d''articles avec titre, URL, date de publication et résumé (max 100 mots chacun).',
    NULL,
    100, 400
  ),
  (
    'cccccccc-0001-0002-0002-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000001',
    'bbbbbbbb-0001-0002-0002-000000000001',
    'Web Search Intelligence',
    'Effectuer des recherches web sur les mots-clés définis dans config_json.keywords. Combiner avec les données scrapées pour détecter les tendances.',
    'Rapport de recherche : top 10 résultats pertinents avec scores de pertinence et détection de tendances émergentes.',
    'cccccccc-0001-0001-0001-000000000001',
    300, 400
  ),
  (
    'cccccccc-0001-0003-0003-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000001',
    'bbbbbbbb-0001-0003-0003-000000000001',
    'Synthesize Intelligence Brief',
    'Analyser toutes les données collectées et produire un brief structuré : 5 bullets stratégiques + 1 signal clé de la journée.',
    'Brief markdown : titre date, 5 bullets numérotés (signal, source, impact), section "Signal Clé" en gras avec recommandation d''action.',
    'cccccccc-0001-0002-0002-000000000001',
    500, 400
  ),
  (
    'cccccccc-0001-0004-0004-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000001',
    'bbbbbbbb-0001-0004-0004-000000000001',
    'Dispatch Alert',
    'Envoyer le brief via Telegram si telegram_on_signal=true. Déclencher une alerte prioritaire si le signal clé dépasse le seuil critique.',
    'Confirmation d''envoi Telegram avec message_id, ou log silencieux si Telegram non configuré.',
    'cccccccc-0001-0003-0003-000000000001',
    700, 400
  )
ON CONFLICT (id) DO NOTHING;


-- =====================================================================
-- Template B — Deep Research Agent
-- aaaaaaaa-0002-*
-- =====================================================================

INSERT INTO public.swarms (id, owner_id, name, description, version, config_json, is_active, is_template)
VALUES (
  'aaaaaaaa-0002-0002-0002-000000000002',
  NULL,
  'Deep Research Agent',
  'Reçois une question, la décompose en 8 sous-questions, mène la recherche web en parallèle et produit un brief structuré 3 pages.',
  1,
  '{"max_sub_questions": 8, "output_format": "markdown", "depth": "deep"}',
  true,
  true
) ON CONFLICT (id) DO NOTHING;

-- Agents Template B
INSERT INTO public.swarm_agents (id, swarm_id, name, role, system_prompt, model_provider, model_name, temperature, position_x, position_y)
VALUES
  (
    'bbbbbbbb-0002-0001-0001-000000000002',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'Question Decomposer',
    'coordinator',
    'Tu es un expert en décomposition analytique de questions complexes. Tu reçois une question principale et la décomposes en sous-questions indépendantes et orthogonales qui couvrent l''ensemble de l''espace de réponse. Tu structures la recherche de façon systématique.',
    'anthropic',
    'claude-opus-4-7',
    0.5,
    100, 100
  ),
  (
    'bbbbbbbb-0002-0002-0002-000000000002',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'Researcher Alpha',
    'executor',
    'Tu mènes des recherches web approfondies sur les sous-questions qui te sont assignées. Tu cherches des sources primaires fiables, des données quantitatives et des expertises reconnues. Tu cites tes sources avec précision.',
    'anthropic',
    'claude-sonnet-4-6',
    0.3,
    300, 50
  ),
  (
    'bbbbbbbb-0002-0003-0003-000000000002',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'Researcher Beta',
    'executor',
    'Tu mènes des recherches web en parallèle de Researcher Alpha sur les sous-questions restantes. Tu te concentres sur les angles complémentaires : contre-arguments, cas d''usage, données historiques et comparaisons sectorielles.',
    'anthropic',
    'claude-sonnet-4-6',
    0.3,
    300, 200
  ),
  (
    'bbbbbbbb-0002-0004-0004-000000000002',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'Research Synthesizer',
    'analyst',
    'Tu reçois tous les résultats de recherche et produis un brief structuré de 3 pages. Tu identifies les consensus, les contradictions, les incertitudes et formules des conclusions actionnables. Tu organises le contenu en sections claires avec executive summary.',
    'anthropic',
    'claude-opus-4-7',
    0.4,
    500, 125
  )
ON CONFLICT (id) DO NOTHING;

-- Tasks Template B (séquentielles)
INSERT INTO public.swarm_tasks (id, swarm_id, agent_id, name, description, expected_output, depends_on_task_id, position_x, position_y)
VALUES
  (
    'cccccccc-0002-0001-0001-000000000002',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'bbbbbbbb-0002-0001-0001-000000000002',
    'Decompose Research Question',
    'Analyser la question principale et la décomposer en 8 sous-questions indépendantes et complémentaires. Assigner les sous-questions 1-4 à Researcher Alpha et 5-8 à Researcher Beta.',
    'Liste de 8 sous-questions numérotées avec leur assignation, angle de recherche et sources suggérées pour chacune.',
    NULL,
    100, 350
  ),
  (
    'cccccccc-0002-0002-0002-000000000002',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'bbbbbbbb-0002-0002-0002-000000000002',
    'Research Sub-Questions Alpha',
    'Mener des recherches approfondies sur les sous-questions 1 à 4. Utiliser la recherche web, les sources académiques et les bases de données sectorielles disponibles.',
    'Rapport de recherche Alpha : réponses documentées aux 4 sous-questions avec sources citées, données clés et niveau de confiance pour chaque affirmation.',
    'cccccccc-0002-0001-0001-000000000002',
    300, 350
  ),
  (
    'cccccccc-0002-0003-0003-000000000002',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'bbbbbbbb-0002-0003-0003-000000000002',
    'Research Sub-Questions Beta',
    'Mener des recherches approfondies sur les sous-questions 5 à 8. Focus sur les contre-arguments, données comparatives et perspectives alternatives.',
    'Rapport de recherche Beta : réponses documentées aux 4 sous-questions avec sources citées, contradictions identifiées et nuances importantes.',
    'cccccccc-0002-0001-0001-000000000002',
    500, 350
  ),
  (
    'cccccccc-0002-0004-0004-000000000002',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'bbbbbbbb-0002-0004-0004-000000000002',
    'Synthesize Research Brief',
    'Fusionner les rapports Alpha et Beta en un brief structuré de 3 pages. Identifier consensus, contradictions, zones d''incertitude. Formuler des conclusions actionnables.',
    'Brief markdown 3 pages : Executive Summary (1/2 page), Analyse détaillée par thème (2 pages), Conclusions & Recommandations (1/2 page). Sources listées en annexe.',
    'cccccccc-0002-0003-0003-000000000002',
    700, 350
  )
ON CONFLICT (id) DO NOTHING;


-- =====================================================================
-- Template C — Voice Evening Debrief
-- aaaaaaaa-0003-*
-- =====================================================================

INSERT INTO public.swarms (id, owner_id, name, description, version, config_json, is_active, is_template)
VALUES (
  'aaaaaaaa-0003-0003-0003-000000000003',
  NULL,
  'Voice Evening Debrief',
  'Transcrit ta note vocale Telegram (Deepgram), extrait décisions et priorités, crée les tâches Notion + blocs Calendar, renvoie un résumé vocal.',
  1,
  '{"transcription_provider": "deepgram", "notion_database_id": "", "calendar_id": "", "output_voice": true}',
  true,
  true
) ON CONFLICT (id) DO NOTHING;

-- Agents Template C
INSERT INTO public.swarm_agents (id, swarm_id, name, role, system_prompt, model_provider, model_name, temperature, position_x, position_y)
VALUES
  (
    'bbbbbbbb-0003-0001-0001-000000000003',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'Voice Transcriber',
    'executor',
    'Tu es spécialisé dans la transcription audio via Deepgram. Tu reçois un fichier audio ou une note vocale Telegram, la transmets à l''API Deepgram pour transcription, et retournes le texte brut avec les timestamps. Tu gères les accents et le langage naturel conversationnel.',
    'anthropic',
    'claude-haiku-4-5-20251001',
    0.1,
    100, 150
  ),
  (
    'bbbbbbbb-0003-0002-0002-000000000003',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'Intent Parser',
    'analyst',
    'Tu analyses la transcription et extrais les éléments structurés : décisions prises, tâches à créer (avec deadline si mentionnée), rendez-vous à planifier, personnes mentionnées et contexte associé. Tu classes les éléments par priorité (haute/normale/basse).',
    'anthropic',
    'claude-opus-4-7',
    0.3,
    300, 150
  ),
  (
    'bbbbbbbb-0003-0003-0003-000000000003',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'Action Dispatcher',
    'executor',
    'Tu reçois les éléments structurés et les dispatches vers les bons services : tâches → Notion (via Composio), rendez-vous → Google Calendar (via Composio), résumé → Telegram. Tu confirmes chaque action effectuée et génères un résumé vocal de confirmation.',
    'anthropic',
    'claude-sonnet-4-6',
    0.2,
    500, 150
  )
ON CONFLICT (id) DO NOTHING;

-- Tasks Template C (séquentielles)
INSERT INTO public.swarm_tasks (id, swarm_id, agent_id, name, description, expected_output, depends_on_task_id, position_x, position_y)
VALUES
  (
    'cccccccc-0003-0001-0001-000000000003',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'bbbbbbbb-0003-0001-0001-000000000003',
    'Transcribe Voice Note',
    'Récupérer la note vocale depuis Telegram, la transmettre à Deepgram pour transcription et retourner le texte complet avec horodatage.',
    'Texte transcrit complet avec timestamps par segment. Durée totale de l''audio et niveau de confiance global de la transcription.',
    NULL,
    100, 350
  ),
  (
    'cccccccc-0003-0002-0002-000000000003',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'bbbbbbbb-0003-0002-0002-000000000003',
    'Parse Intents and Actions',
    'Analyser la transcription et extraire : décisions prises, tâches créées avec deadlines, événements à planifier, personnes mentionnées. Classer par priorité.',
    'JSON structuré avec : decisions[], tasks[{title, deadline, priority, assignee}], events[{title, date, time, duration, attendees}], mentions[]. Résumé en 3 lignes.',
    'cccccccc-0003-0001-0001-000000000003',
    300, 350
  ),
  (
    'cccccccc-0003-0003-0003-000000000003',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'bbbbbbbb-0003-0003-0003-000000000003',
    'Dispatch to Services',
    'Créer les tâches dans Notion, les blocs dans Google Calendar, envoyer un résumé Telegram. Générer un message de confirmation vocal synthétique.',
    'Confirmation des actions : N tâches créées dans Notion (avec liens), N événements ajoutés au Calendar, message Telegram envoyé. Texte du résumé vocal de confirmation.',
    'cccccccc-0003-0002-0002-000000000003',
    500, 350
  )
ON CONFLICT (id) DO NOTHING;
