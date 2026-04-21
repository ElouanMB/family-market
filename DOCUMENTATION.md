# Documentation Family Market

Family Market est une application mobile de gestion de listes de courses collaborative conçue pour les familles. Chaque utilisateur dispose de son propre environnement de données via une instance Firebase personnelle.

## Fonctionnalités principales

- Création et gestion de multiples listes de courses.
- Synchronisation en temps réel entre les membres de la famille.
- Mode hors-ligne avec synchronisation automatique lors du retour de la connexion.
- Gestion dynamique des membres (ajout, suppression, personnalisation des couleurs).
- Journal d'historique des actions effectuées par chaque membre.
- Système de notifications push pour les mises à jour importantes.

## Architecture technique

- Framework : React Native / Expo.
- Base de données : Google Firestore (NoSQL).
- État local : AsyncStorage pour la persistence des données hors-ligne.
- Style : React Native Paper - Thème sombre (Onyx Pro).

## Installation et configuration du projet

### 1. Prérequis
- Un compte Google Firebase pour l'hébergement des données.
- Node.js (uniquement pour la phase de build).
- EAS CLI installé (`npm install -g eas-cli`) pour générer l'application.

### 2. Configuration de Firebase
Pour utiliser votre propre base de données, vous devez créer un projet sur le site Firebase et activer les services suivants :
- Firestore Database.
- Cloud Messaging (pour les notifications).

Une fois le projet créé, récupérez vos identifiants d'API et créez un fichier `.env` à la racine du projet avec les variables suivantes :

```text
EXPO_PUBLIC_FIREBASE_API_KEY=votre_cle
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=votre_domaine
EXPO_PUBLIC_FIREBASE_PROJECT_ID=votre_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=votre_bucket
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=votre_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=votre_app_id
```

### 3. Configuration Native (Android)
Le fichier `google-services.json` est indispensable pour lier l'application aux services natifs de Google sur Android, notamment pour le fonctionnement des notifications push via FCM (Firebase Cloud Messaging).
- **Obtention** : Rendez-vous dans la console Firebase, ajoutez une application Android à votre projet, et téléchargez le fichier généré.
- **Utilisation** : À placer directement à la racine du dossier `family-market/`.

### 4. Clés Admin SDK
Le fichier de type `firebase-adminsdk-*.json` donne un accès privilégié à l'ensemble des services Firebase. Il est principalement utilisé si vous souhaitez exécuter des scripts de maintenance ou des fonctions d'administration personnalisées depuis un environnement sécurisé (serveur ou CLI).
- **Obtention** : Console Firebase > Paramètres du projet > Comptes de service > Générer une nouvelle clé privée.
- **Utilisation** : À conserver à la racine du projet pour vos outils d'administration.

### 5. Génération et Installation (Production)
Pour utiliser l'application de manière permanente sur un téléphone Android (sans passer par un outil de développement), vous devez générer un fichier APK :

1. Connectez-vous à votre compte Expo : `npx eas login`
2. Lancez la compilation : `npx eas build --platform android --profile preview`
3. Une fois terminée, téléchargez l'APK via le lien fourni ou le QR Code.
4. Installez l'APK sur votre téléphone.

## Utilisation de l'application

### Initialisation
Au premier lancement, l'application vous demandera de créer le premier membre de la famille. Une fois créé, ce profil sera enregistré localement sur votre téléphone.

### Gestion des membres
Dans l'écran principal, une icône d'engrenage permet d'accéder aux paramètres. Dans cette section, vous pouvez :
- Ajouter de nouveaux membres.
- Supprimer des profils existants.
- Changer la couleur associée à un membre en cliquant sur son avatar.
- Changer d'utilisateur connecté.

### Gestion des listes
La liste par défaut est protégée contre la suppression mais peut être renommée. Pour créer une nouvelle liste, utilisez le bouton d'ajout en bas à droite et basculez en mode "Nouvelle liste".

### Historique
L'onglet Journal répertorie toutes les modifications (ajouts, suppressions, achats effectués) avec le nom du membre responsable et l'heure précise de l'action.

## Maintenance et Builds

Pour générer une version APK ou un build natif pour iOS/Android, utilisez EAS CLI :
```bash
npx eas-cli build --platform android --profile preview
```
Les mises à jour de code javascript peuvent être poussées sans réinstallation via Expo Updates.
