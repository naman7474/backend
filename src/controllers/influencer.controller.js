const supabase = require('../config/supabase');

const influencerController = {
  // Get recommended influencers based on user profile
  async getRecommendedInfluencers(req, res) {
    try {
      const userId = req.user.id;

      // Get user's skin profile for matching
      const { data: userProfile, error: profileError } = await supabase
        .from('skin_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileError) {
        console.error('Get user profile error:', profileError);
        return res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to get user profile'
          }
        });
      }

      // Get influencers with similar skin profiles (this would be more sophisticated in production)
      const { data: influencers, error } = await supabase
        .from('influencers')
        .select(`
          *,
          influencer_products(
            id,
            product_id,
            recommendation_reason,
            products(name, brand, price, image_url)
          )
        `)
        .limit(10);

      if (error) {
        console.error('Get influencers error:', error);
        return res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to fetch influencers'
          }
        });
      }

      // Mock matching algorithm - in production this would be more sophisticated
      const recommendedInfluencers = influencers.map(influencer => ({
        id: influencer.id,
        name: influencer.name,
        username: influencer.username,
        profile_image_url: influencer.profile_image_url,
        bio_short: influencer.bio_short,
        follower_count: influencer.follower_count,
        skin_type: influencer.skin_type,
        specialties: influencer.specialties,
        match_percentage: Math.floor(Math.random() * 30) + 70, // Mock matching
        recent_recommendations: influencer.influencer_products?.slice(0, 3) || []
      }));

      res.json({
        success: true,
        data: {
          influencers: recommendedInfluencers,
          total_count: recommendedInfluencers.length
        }
      });

    } catch (error) {
      console.error('Get recommended influencers error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal server error'
        }
      });
    }
  },

  // Get influencer details
  async getInfluencerDetails(req, res) {
    try {
      const { id } = req.params;

      const { data: influencer, error } = await supabase
        .from('influencers')
        .select(`
          *,
          influencer_products(
            id,
            product_id,
            recommendation_reason,
            rating,
            review_text,
            created_at,
            products(*)
          )
        `)
        .eq('id', id)
        .single();

      if (error) {
        console.error('Get influencer details error:', error);
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Influencer not found'
          }
        });
      }

      res.json({
        success: true,
        data: {
          influencer: {
            ...influencer,
            product_recommendations: influencer.influencer_products || []
          }
        }
      });

    } catch (error) {
      console.error('Get influencer details error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal server error'
        }
      });
    }
  },

  // Get influencer's product recommendations
  async getInfluencerProducts(req, res) {
    try {
      const { id } = req.params;

      const { data: products, error } = await supabase
        .from('influencer_products')
        .select(`
          *,
          products(*)
        `)
        .eq('influencer_id', id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Get influencer products error:', error);
        return res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to fetch influencer products'
          }
        });
      }

      res.json({
        success: true,
        data: {
          products: products.map(item => ({
            ...item.products,
            recommendation_reason: item.recommendation_reason,
            influencer_rating: item.rating,
            review_text: item.review_text,
            recommended_at: item.created_at
          })),
          total_count: products.length
        }
      });

    } catch (error) {
      console.error('Get influencer products error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal server error'
        }
      });
    }
  }
};

module.exports = influencerController; 