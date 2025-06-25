const supabase = require('../config/supabase');
const { validationResult } = require('express-validator');

const progressController = {
  // Save routine completion
  async saveRoutineCompletion(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: errors.array()
          }
        });
      }

      const userId = req.user.id;
      const { date, routine_type, completed, products_used, notes } = req.body;

      // Insert or update routine completion
      const { data, error } = await supabase
        .from('routine_completions')
        .upsert({
          user_id: userId,
          date,
          routine_type,
          completed,
          products_used,
          notes,
          created_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,date,routine_type'
        });

      if (error) {
        console.error('Save routine completion error:', error);
        return res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to save routine completion'
          }
        });
      }

      res.json({
        success: true,
        data: {
          message: 'Routine completion saved successfully'
        }
      });

    } catch (error) {
      console.error('Save routine completion error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal server error'
        }
      });
    }
  },

  // Get progress timeline
  async getProgressTimeline(req, res) {
    try {
      const userId = req.user.id;
      const { start_date, end_date } = req.query;

      let query = supabase
        .from('routine_completions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      if (start_date) {
        query = query.gte('date', start_date);
      }

      if (end_date) {
        query = query.lte('date', end_date);
      }

      const { data: routineData, error } = await query;

      if (error) {
        console.error('Get progress timeline error:', error);
        return res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to fetch progress timeline'
          }
        });
      }

      // Calculate statistics
      const totalDays = routineData.length;
      const completedDays = routineData.filter(r => r.completed).length;
      const overallPercentage = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

      // Calculate streaks
      let currentStreak = 0;
      let longestStreak = 0;
      let tempStreak = 0;

      const sortedData = routineData.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      for (let i = 0; i < sortedData.length; i++) {
        if (sortedData[i].completed) {
          tempStreak++;
          if (i === 0) currentStreak = tempStreak;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 0;
          if (i === 0) currentStreak = 0;
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak);

      res.json({
        success: true,
        data: {
          completion_stats: {
            overall_percentage: overallPercentage,
            current_streak: currentStreak,
            longest_streak: longestStreak,
            total_days: totalDays
          },
          daily_records: routineData.map(record => ({
            date: record.date,
            morning: record.routine_type === 'morning' ? record.completed : null,
            evening: record.routine_type === 'evening' ? record.completed : null,
            notes: record.notes
          })),
          improvements: {
            // This would typically come from periodic skin assessments
            // For now, return placeholder data
            acne: {
              initial_severity: "moderate",
              current_severity: "mild",
              improvement_percentage: 35
            }
          }
        }
      });

    } catch (error) {
      console.error('Get progress timeline error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal server error'
        }
      });
    }
  },

  // Submit feedback
  async submitFeedback(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: errors.array()
          }
        });
      }

      const userId = req.user.id;
      const { days_used, overall_satisfaction, skin_improvements, routine_adjustments_needed, comments } = req.body;

      const { data, error } = await supabase
        .from('user_feedback')
        .insert({
          user_id: userId,
          days_used,
          overall_satisfaction,
          skin_improvements,
          routine_adjustments_needed,
          comments,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Submit feedback error:', error);
        return res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to submit feedback'
          }
        });
      }

      res.json({
        success: true,
        data: {
          message: 'Feedback submitted successfully'
        }
      });

    } catch (error) {
      console.error('Submit feedback error:', error);
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

module.exports = progressController; 