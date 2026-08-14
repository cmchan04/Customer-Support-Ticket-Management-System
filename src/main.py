import pandas as pd
from pathlib import Path
import importlib.util
import importlib
import subprocess
import sys
from collections import Counter

try:
    import nltk
    from nltk.tokenize import word_tokenize
    from nltk.stem import WordNetLemmatizer
    from nltk.util import bigrams
    from nltk.util import trigrams
except ImportError:
    nltk = None
    word_tokenize = None
    WordNetLemmatizer = None
    bigrams = None
    trigrams = None

try:
    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
except ImportError:
    ENGLISH_STOP_WORDS = None

try:
    import matplotlib.pyplot as plt
except ImportError:
    plt = None


lemmatizer = None



def ensure_environment_resources():
    """Ensure required packages and NLTK resources are available in the current environment."""
    required_packages = {
        'nltk': 'nltk',
        'sklearn': 'scikit-learn',
        'matplotlib': 'matplotlib',
    }

    for module_name, package_name in required_packages.items():
        if importlib.util.find_spec(module_name) is None:
            print(f"Installing missing package: {package_name}")
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', package_name])

    nltk_module = importlib.import_module('nltk')
    nltk_tokenize_module = importlib.import_module('nltk.tokenize')
    sklearn_text_module = importlib.import_module('sklearn.feature_extraction.text')
    matplotlib_pyplot = importlib.import_module('matplotlib.pyplot')

    try:
        nltk_module.data.find('tokenizers/punkt')
    except LookupError:
        print("Downloading NLTK resource: punkt")
        nltk_module.download('punkt', quiet=True)

    try:
        nltk_module.data.find('corpora/wordnet')
    except LookupError:
        print("Downloading NLTK resource: wordnet")
        nltk_module.download('wordnet', quiet=True)

    try:
        nltk_module.data.find('corpora/omw-1.4')
    except LookupError:
        print("Downloading NLTK resource: omw-1.4")
        nltk_module.download('omw-1.4', quiet=True)

    global word_tokenize, ENGLISH_STOP_WORDS, lemmatizer, plt
    word_tokenize = nltk_tokenize_module.word_tokenize
    ENGLISH_STOP_WORDS = sklearn_text_module.ENGLISH_STOP_WORDS
    lemmatizer = nltk_module.stem.WordNetLemmatizer()
    plt = matplotlib_pyplot



def load_data():
    # Get the directory of the current script (src)
    curr_dir = Path(__file__).parent
    
    # Construct the path to the dataset relative to the script
    data_path = curr_dir.parent / "resources/data/aa_dataset-tickets-multi-lang-5-2-50-version.csv"
    
    print(f"Loading dataset from: {data_path.resolve()}")

    # Retrieve the dataset from the specified path and load it into a pandas DataFrame
    try:
        df = pd.read_csv(data_path)
        print(f"Successfully loaded dataset with shape (Records, Attributes): {df.shape}")
        return df
    except FileNotFoundError:
        print(f"Error: Dataset not found at {data_path}")
        return None



def text_preprocessing(df):

    pd.set_option('display.width', 1000)
    pd.set_option('display.max_colwidth', None)

    """
    Builds a cleaned text column from subject + body.
    """
    print("\nApplying text preprocessing on 'subject' + 'body'...")

    df_text = df.copy()
    subject_text = df_text['subject'].fillna('').astype(str)
    body_text = df_text['body'].fillna('').astype(str)

    # Join subject and body into one text field.
    df_text['text'] = (subject_text + ' ' + body_text).str.strip()

    # Normalize escaped/newline markers first so they do not become stray tokens like "n".
    df_text['text'] = df_text['text'].str.replace(r'\\[nrt]+', ' ', regex=True)
    df_text['text'] = df_text['text'].str.replace(r'[\r\n\t]+', ' ', regex=True)

    # Remove URLs, lowercase/trim, and remove punctuation/special characters.
    df_text['text'] = df_text['text'].str.replace(r'https?://\S+|www\.\S+', ' ', regex=True)
    df_text['text'] = df_text['text'].str.lower().str.strip()
    df_text['text'] = df_text['text'].str.replace(r'[^a-z0-9\s]', ' ', regex=True)
    df_text['text'] = df_text['text'].str.replace(r'\s+', ' ', regex=True).str.strip()

    # Tokenize text into individual terms using NLTK.
    df_text['tokens'] = df_text['text'].apply(word_tokenize)

    # Remove stop words using scikit-learn's built-in English stop-word list.
    df_text['tokens'] = df_text['tokens'].apply(
        lambda tokens: [t for t in tokens if t not in ENGLISH_STOP_WORDS]
    )

    # Lemmatize as the final step after stop-word removal.
    df_text['tokens'] = df_text['tokens'].apply(
        lambda tokens: [lemmatizer.lemmatize(token) for token in tokens]
    )

    # Text reconstruction after token processing (useful for vectorizers).
    df_text['text'] = df_text['tokens'].apply(lambda tokens: ' '.join(tokens))

    # Print a sample of the cleaned text
    print("\nSample Output:")
    sample_tokens = df_text['tokens'].iloc[0]
    print(sample_tokens)
    print(df_text.dtypes)
    pd.reset_option('display.width')
    pd.reset_option('display.max_colwidth')

    print("Text preprocessing completed. New column created: 'text' 'tokens'.")
    return df_text



def preprocess_data(df):
    """
    Applies preprocessing steps to the raw dataset.
    """
    print("\n--- Data Preprocessing ---")
    # Filter to remain only "en" language, making a copy to keep raw dataset unchanged
    print("\nFiltering dataset to include only tickets with language 'en'...")
    df_processed = df[df['language'] == 'en'].copy()
    print(f"Filtered 'en' dataset shape  (Records, Attributes): {df_processed.shape}")
    
    # Check duplicate records and inconsistencies by subject and body, print them, then keep only unique rows
    print("\nChecking for duplicate records and inconsistencies based on 'subject' and 'body'...")
    duplicate_mask = df_processed.duplicated(subset=['subject', 'body'], keep=False)
    duplicate_records = df_processed[duplicate_mask]

    if not duplicate_records.empty:
        print(f"Found {len(duplicate_records)} duplicate rows (including repeated copies):")
        print(duplicate_records)
    else:
        print("No duplicate rows found in subject or body.")

    before_dedup_shape = df_processed.shape
    df_processed = df_processed.drop_duplicates(subset=['subject', 'body'], keep='first').copy()
    print(
        f"Dataset shape after removing duplicates: {df_processed.shape} "
        f"(removed {before_dedup_shape[0] - df_processed.shape[0]} rows)"
    )

    # Check for missing values in specific columns
    print("\nChecking for missing values in 'subject', 'body', 'priority', 'type', and 'queue' columns...")
    columns_to_check = ['subject', 'body', 'priority', 'type', 'queue']
    missing_values = df_processed[columns_to_check].isnull().sum()
    
    print("\nMissing values in the requested columns:")
    print(missing_values)

    # Pass the dataset for text preprocessing.
    df_processed = text_preprocessing(df_processed)
    
    return df_processed



# Helper function to extract bigrams from a list of tokens.
def extract_bigrams(token_list):
    if bigrams is None or not isinstance(token_list, list) or len(token_list) < 2:
        return []
    return [f"{left} {right}" for left, right in bigrams(token_list)]


def extract_trigrams(token_list):
    if trigrams is None or not isinstance(token_list, list) or len(token_list) < 3:
        return []
    return [f"{first} {second} {third}" for first, second, third in trigrams(token_list)]



def eda(df):
    """Create bar chart distributions for queue and priority."""
    if plt is None:
        ensure_environment_resources()

    eda_df = df.copy()
    queue_counts = eda_df['queue'].fillna('Missing').value_counts()
    priority_counts = eda_df['priority'].fillna('Missing').value_counts()

    output_dir = Path(__file__).parent.parent / 'resources' / 'eda_output'
    output_dir.mkdir(parents=True, exist_ok=True)

    # Separate chart for queue distribution.
    fig_queue, ax_queue = plt.subplots(figsize=(9, 5))
    queue_counts.plot(kind='bar', ax=ax_queue, color='steelblue')
    ax_queue.set_title('Queue Distribution of Customer Support Tickets')
    ax_queue.set_xlabel('Queue')
    ax_queue.set_ylabel('Frequency')
    ax_queue.tick_params(axis='x', rotation=45)
    for patch in ax_queue.patches:
        height = patch.get_height()
        ax_queue.annotate(
            f"{int(height)}",
            (patch.get_x() + patch.get_width() / 2, height),
            ha='center',
            va='bottom',
            fontsize=8,
            xytext=(0, 3),
            textcoords='offset points',
        )
    plt.tight_layout()
    queue_output_path = output_dir / 'queue_distribution.png'
    fig_queue.savefig(queue_output_path, dpi=300)
    plt.close(fig_queue)

    # Separate chart for priority distribution.
    fig_priority, ax_priority = plt.subplots(figsize=(7, 5))
    priority_counts.plot(kind='bar', ax=ax_priority, color='darkorange')
    ax_priority.set_title('Priority Distribution of Customer Support Tickets')
    ax_priority.set_xlabel('Priority')
    ax_priority.set_ylabel('Frequency')
    ax_priority.tick_params(axis='x', rotation=0)
    for patch in ax_priority.patches:
        height = patch.get_height()
        ax_priority.annotate(
            f"{int(height)}",
            (patch.get_x() + patch.get_width() / 2, height),
            ha='center',
            va='bottom',
            fontsize=8,
            xytext=(0, 3),
            textcoords='offset points',
        )
    plt.tight_layout()
    priority_output_path = output_dir / 'priority_distribution.png'
    fig_priority.savefig(priority_output_path, dpi=300)
    plt.close(fig_priority)

    # Histogram for ticket text length distribution (number of words per ticket).
    if 'tokens' in eda_df.columns:
        text_length = eda_df['tokens'].apply(
            lambda tokens: len(tokens) if isinstance(tokens, list) else len(str(tokens).split())
        )
    else:
        text_length = eda_df['text'].fillna('').astype(str).str.split().str.len()

    fig_length, ax_length = plt.subplots(figsize=(9, 5))
    ax_length.hist(text_length, bins=30, color='seagreen', edgecolor='black')
    ax_length.set_title('Ticket Text Length Distribution')
    ax_length.set_xlabel('Number of Words per Ticket')
    ax_length.set_ylabel('Frequency')
    plt.tight_layout()
    text_length_output_path = output_dir / 'text_length_distribution.png'
    fig_length.savefig(text_length_output_path, dpi=300)
    plt.close(fig_length)
    print(f"Average text length per ticket: {text_length.mean():.2f} words")

    # Frequency analysis: top 5 frequent tokens for each queue category and priority.
    print("\nTop 10 frequent tokens by queue:")
    frequency_df = eda_df[['queue', 'tokens']].copy()
    frequency_df['queue'] = frequency_df['queue'].fillna('Missing')

    if 'tokens' not in eda_df.columns:
        frequency_df['tokens'] = eda_df['text'].fillna('').astype(str).str.split()

    for queue_name in sorted(frequency_df['queue'].unique()):
        queue_tokens = frequency_df.loc[frequency_df['queue'] == queue_name, 'tokens']
        flattened_tokens = [
            token
            for token_list in queue_tokens
            for token in (token_list if isinstance(token_list, list) else [])
            if token
        ]

        token_counts = Counter(flattened_tokens)
        top_n_tokens = token_counts.most_common(10)
        formatted_top_n = ", ".join([f"{token} ({count})" for token, count in top_n_tokens])
        print(f"- {queue_name}: {formatted_top_n if formatted_top_n else 'No tokens'}")


    print("\nTop 10 frequent tokens by priority:")
    frequency_df = eda_df[['priority', 'tokens']].copy()
    frequency_df['priority'] = frequency_df['priority'].fillna('Missing')

    if 'tokens' not in eda_df.columns:
        frequency_df['tokens'] = eda_df['text'].fillna('').astype(str).str.split()

    for queue_name in sorted(frequency_df['priority'].unique()):
        queue_tokens = frequency_df.loc[frequency_df['priority'] == queue_name, 'tokens']
        flattened_tokens = [
            token
            for token_list in queue_tokens
            for token in (token_list if isinstance(token_list, list) else [])
            if token
        ]

        token_counts = Counter(flattened_tokens)
        top_n_tokens = token_counts.most_common(10)
        formatted_top_n = ", ".join([f"{token} ({count})" for token, count in top_n_tokens])
        print(f"- {queue_name}: {formatted_top_n if formatted_top_n else 'No tokens'}")



    # N-gram analysis: top bigrams by queue and by priority.
    print("\nTop 10 bigrams by queue:")
    bigram_queue_df = eda_df[['queue', 'tokens']].copy()
    bigram_queue_df['queue'] = bigram_queue_df['queue'].fillna('Missing')
    if 'tokens' not in eda_df.columns:
        bigram_queue_df['tokens'] = eda_df['text'].fillna('').astype(str).str.split()
    bigram_queue_df['bigrams'] = bigram_queue_df['tokens'].apply(extract_bigrams)

    for queue_name in sorted(bigram_queue_df['queue'].unique()):
        queue_bigrams = bigram_queue_df.loc[bigram_queue_df['queue'] == queue_name, 'bigrams']
        flattened_bigrams = [bigram for bigram_list in queue_bigrams for bigram in bigram_list]
        bigram_counts = Counter(flattened_bigrams)
        top_n_bigrams = bigram_counts.most_common(10)
        formatted_top_n = ", ".join([f"{bigram} ({count})" for bigram, count in top_n_bigrams])
        print(f"- {queue_name}: {formatted_top_n if formatted_top_n else 'No bigrams'}")

    print("\nTop 10 bigrams by priority:")
    bigram_priority_df = eda_df[['priority', 'tokens']].copy()
    bigram_priority_df['priority'] = bigram_priority_df['priority'].fillna('Missing')
    if 'tokens' not in eda_df.columns:
        bigram_priority_df['tokens'] = eda_df['text'].fillna('').astype(str).str.split()
    bigram_priority_df['bigrams'] = bigram_priority_df['tokens'].apply(extract_bigrams)

    for priority_name in sorted(bigram_priority_df['priority'].unique()):
        priority_bigrams = bigram_priority_df.loc[bigram_priority_df['priority'] == priority_name, 'bigrams']
        flattened_bigrams = [bigram for bigram_list in priority_bigrams for bigram in bigram_list]
        bigram_counts = Counter(flattened_bigrams)
        top_n_bigrams = bigram_counts.most_common(10)
        formatted_top_n = ", ".join([f"{bigram} ({count})" for bigram, count in top_n_bigrams])
        print(f"- {priority_name}: {formatted_top_n if formatted_top_n else 'No bigrams'}")

    # N-gram analysis: top trigrams by queue and by priority.
    print("\nTop 10 trigrams by queue:")
    trigram_queue_df = eda_df[['queue', 'tokens']].copy()
    trigram_queue_df['queue'] = trigram_queue_df['queue'].fillna('Missing')
    if 'tokens' not in eda_df.columns:
        trigram_queue_df['tokens'] = eda_df['text'].fillna('').astype(str).str.split()
    trigram_queue_df['trigrams'] = trigram_queue_df['tokens'].apply(extract_trigrams)

    for queue_name in sorted(trigram_queue_df['queue'].unique()):
        queue_trigrams = trigram_queue_df.loc[trigram_queue_df['queue'] == queue_name, 'trigrams']
        flattened_trigrams = [trigram for trigram_list in queue_trigrams for trigram in trigram_list]
        trigram_counts = Counter(flattened_trigrams)
        top_n_trigrams = trigram_counts.most_common(10)
        formatted_top_n = ", ".join([f"{trigram} ({count})" for trigram, count in top_n_trigrams])
        print(f"- {queue_name}: {formatted_top_n if formatted_top_n else 'No trigrams'}")

    print("\nTop 10 trigrams by priority:")
    trigram_priority_df = eda_df[['priority', 'tokens']].copy()
    trigram_priority_df['priority'] = trigram_priority_df['priority'].fillna('Missing')
    if 'tokens' not in eda_df.columns:
        trigram_priority_df['tokens'] = eda_df['text'].fillna('').astype(str).str.split()
    trigram_priority_df['trigrams'] = trigram_priority_df['tokens'].apply(extract_trigrams)

    for priority_name in sorted(trigram_priority_df['priority'].unique()):
        priority_trigrams = trigram_priority_df.loc[trigram_priority_df['priority'] == priority_name, 'trigrams']
        flattened_trigrams = [trigram for trigram_list in priority_trigrams for trigram in trigram_list]
        trigram_counts = Counter(flattened_trigrams)
        top_n_trigrams = trigram_counts.most_common(10)
        formatted_top_n = ", ".join([f"{trigram} ({count})" for trigram, count in top_n_trigrams])
        print(f"- {priority_name}: {formatted_top_n if formatted_top_n else 'No trigrams'}")

    print(f"EDA chart saved to: {queue_output_path}")
    print(f"EDA chart saved to: {priority_output_path}")
    print(f"EDA chart saved to: {text_length_output_path}")



if __name__ == "__main__":
    ensure_environment_resources()

    # Load the dataset into the environment
    raw_dataset = load_data()

    if raw_dataset is not None:
        # Preprocess the dataset while keeping the raw dataset intact
        processed_dataset = preprocess_data(raw_dataset)

        # Run EDA and save queue/priority distribution chart.
        eda(processed_dataset)

        # # Configure pandas to show all columns without truncation
        # pd.set_option('display.max_columns', None)
        # pd.set_option('display.width', 1000)
        
        # Display the first few rows to verify
        print("\nFirst 5 rows of the processed dataset:")
        print(processed_dataset.head())
