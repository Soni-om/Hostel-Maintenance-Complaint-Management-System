/**
 * HostelCare — Administrator Governance & Analytics Controller
 * Computes live system metrics, operational KPIs, SLA resolution analytics,
 * and user/category distribution from the database.
 */

import pool from '../config/db.js';

const AdminController = {
  /**
   * Retrieves comprehensive live dashboard analytics for Administrators
   * GET /api/admin/stats or GET /api/admin/dashboard
   * Access: Admin only
   */
  async getStats(req, res) {
    try {
      // 1. Complaint statistics by status
      const [statusRows] = await pool.query(`
        SELECT 
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) AS assigned,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
          SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed
        FROM complaints
      `);

      const complaintStats = {
        total: Number(statusRows[0]?.total || 0),
        pending: Number(statusRows[0]?.pending || 0),
        assigned: Number(statusRows[0]?.assigned || 0),
        in_progress: Number(statusRows[0]?.in_progress || 0),
        resolved: Number(statusRows[0]?.resolved || 0),
        closed: Number(statusRows[0]?.closed || 0)
      };

      // 2. Complaint statistics by priority
      const [priorityRows] = await pool.query(`
        SELECT 
          SUM(CASE WHEN priority = 'low' THEN 1 ELSE 0 END) AS low,
          SUM(CASE WHEN priority = 'normal' THEN 1 ELSE 0 END) AS normal,
          SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) AS high,
          SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) AS urgent
        FROM complaints
      `);

      const priorityStats = {
        low: Number(priorityRows[0]?.low || 0),
        normal: Number(priorityRows[0]?.normal || 0),
        high: Number(priorityRows[0]?.high || 0),
        urgent: Number(priorityRows[0]?.urgent || 0)
      };

      // 3. User distribution statistics
      const [userRows] = await pool.query(`
        SELECT 
          COUNT(*) AS total,
          SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students,
          SUM(CASE WHEN role = 'staff' THEN 1 ELSE 0 END) AS staff,
          SUM(CASE WHEN role = 'staff' AND account_status = 'active' THEN 1 ELSE 0 END) AS active_staff,
          SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins,
          SUM(CASE WHEN role = 'admin' AND account_status = 'active' THEN 1 ELSE 0 END) AS active_admins,
          SUM(CASE WHEN account_status = 'inactive' THEN 1 ELSE 0 END) AS inactive
        FROM users
      `);

      const userStats = {
        total: Number(userRows[0]?.total || 0),
        students: Number(userRows[0]?.students || 0),
        staff: Number(userRows[0]?.staff || 0),
        active_staff: Number(userRows[0]?.active_staff || 0),
        admins: Number(userRows[0]?.admins || 0),
        active_admins: Number(userRows[0]?.active_admins || 0),
        inactive: Number(userRows[0]?.inactive || 0)
      };

      // 4. Resolution performance & SLA metrics
      const [resolutionRows] = await pool.query(`
        SELECT 
          COUNT(*) AS resolved_total,
          ROUND(AVG(TIMESTAMPDIFF(SECOND, created_at, resolved_at)) / 3600, 1) AS avg_hours
        FROM complaints
        WHERE resolved_at IS NOT NULL
      `);

      const performance = {
        resolved_total: Number(resolutionRows[0]?.resolved_total || 0),
        avg_resolution_hours: resolutionRows[0]?.avg_hours !== null ? Number(resolutionRows[0]?.avg_hours) : 0.0
      };

      // 5. Resident feedback analytics
      const [feedbackRows] = await pool.query(`
        SELECT 
          COUNT(*) AS total,
          ROUND(AVG(rating), 1) AS avg_rating,
          SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS rating_5,
          SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS rating_4,
          SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS rating_3,
          SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS rating_2,
          SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS rating_1
        FROM feedback
      `);

      const feedbackStats = {
        total: Number(feedbackRows[0]?.total || 0),
        avg_rating: feedbackRows[0]?.avg_rating !== null ? Number(feedbackRows[0]?.avg_rating) : 0.0,
        ratings: {
          5: Number(feedbackRows[0]?.rating_5 || 0),
          4: Number(feedbackRows[0]?.rating_4 || 0),
          3: Number(feedbackRows[0]?.rating_3 || 0),
          2: Number(feedbackRows[0]?.rating_2 || 0),
          1: Number(feedbackRows[0]?.rating_1 || 0)
        }
      };

      // 6. Category breakdown with complaint counts
      const [categoryRows] = await pool.query(`
        SELECT 
          c.id, 
          c.name, 
          c.active, 
          COUNT(comp.id) AS complaint_count
        FROM complaint_categories c
        LEFT JOIN complaints comp ON comp.category_id = c.id
        GROUP BY c.id
        ORDER BY complaint_count DESC, c.id ASC
      `);

      const categoryStats = categoryRows.map((cat) => ({
        id: cat.id,
        name: cat.name,
        active: Boolean(cat.active),
        complaint_count: Number(cat.complaint_count || 0)
      }));

      // 7. Hostel block breakdown
      const [blockRows] = await pool.query(`
        SELECT 
          hb.id,
          hb.block_name,
          COUNT(c.id) AS complaint_count
        FROM hostel_blocks hb
        LEFT JOIN complaints c ON c.block_id = hb.id
        GROUP BY hb.id
        ORDER BY hb.block_name ASC
      `);

      const blockStats = blockRows.map((b) => ({
        id: b.id,
        block_name: b.block_name,
        complaint_count: Number(b.complaint_count || 0)
      }));

      // 8. Recent 10 complaints
      const [recentRows] = await pool.query(`
        SELECT 
          c.id,
          c.ticket_number,
          c.title,
          c.status,
          c.priority,
          c.hostel_block,
          c.room_number,
          c.created_at,
          c.resolved_at,
          u.name AS student_name,
          cat.name AS category_name
        FROM complaints c
        JOIN users u ON c.student_id = u.id
        JOIN complaint_categories cat ON c.category_id = cat.id
        ORDER BY c.created_at DESC
        LIMIT 10
      `);

      return res.status(200).json({
        success: true,
        stats: {
          complaints: complaintStats,
          priorities: priorityStats,
          users: userStats,
          performance,
          feedback: feedbackStats,
          categories: categoryStats,
          blocks: blockStats,
          recent_complaints: recentRows
        }
      });
    } catch (error) {
      console.error('Admin getStats Controller Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve administrative statistics.'
      });
    }
  }
};

export default AdminController;
